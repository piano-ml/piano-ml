package org.pianoml.backend.controller;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.api.AccountApi;
import org.pianoml.backend.model.*;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import jakarta.servlet.http.HttpServletRequest;

import static org.pianoml.backend.security.JwtAuthenticationFilter.getJwtFromRequest;

@RestController
@Slf4j
public class AccountController implements AccountApi {

  @Autowired
  private AccountService accountService;

  @Autowired
  private JwtTokenProvider jwtTokenProvider;

  @Override
  public ResponseEntity<Void> accountCreatePost(AccountCreatePostRequest accountCreatePostRequest) {
    accountService.createUser(accountCreatePostRequest);
    return new ResponseEntity<>(HttpStatus.CREATED);
  }

  @Override
  public ResponseEntity<AccountLoginPost200Response> accountLoginPost(AccountLoginPostRequest accountLoginPostRequest) {
    // Perform login and obtain token
    AccountLoginPost200Response response = accountService.loginUser(accountLoginPostRequest);
    String token = response.getToken();

    // Guard: ensure token is present before setting cookie. If missing, return 500 to avoid setting invalid cookie.
    if (token == null || token.isBlank()) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
    }

    // Build secure HttpOnly cookie for cross-site usage. SameSite=None and Secure are required for cross-site cookies.
    // Determine origin to optionally set cookie domain (allow sharing across subdomains like api.pianoml.org -> pianoml.org)
    ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
    String origin = null;
    if (attrs != null) {
      origin = attrs.getRequest().getHeader("Origin");
    }

    // Determine secure / samesite behavior: browsers require SameSite=None together with Secure=true.
    // For local HTTP development we switch to SameSite=Lax and Secure=false so the browser accepts the cookie.
    boolean isLocalHttp = origin != null && (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"));
    boolean isSecure = !isLocalHttp;
    String sameSite = isSecure ? "None" : "Lax";

    // RFC2616 forbids spaces in cookie values; store the raw token (no "Bearer " prefix) in the cookie.
    ResponseCookie.ResponseCookieBuilder cookieBuilder = ResponseCookie.from("Authorization", token)
      .httpOnly(true)
      .sameSite(sameSite)
      .path("/")
      .maxAge(jwtTokenProvider.getJwtExpirationInMs() / 1000) // aligned with JWT token lifetime
      .secure(isSecure);

    // If request comes from a pianoml.org origin, set Domain to .pianoml.org so subdomains share the cookie.
    if (origin != null && (origin.contains("pianoml.org") || origin.contains("www.pianoml.org"))) {
      cookieBuilder = cookieBuilder.domain(".pianoml.org");
    }

    ResponseCookie cookie = cookieBuilder.build();
    log.info("Setting login cookie: {} {} {}", origin, sameSite, isSecure);
    return ResponseEntity.ok()
      .header(HttpHeaders.SET_COOKIE, cookie.toString())
      .body(response);
  }

  @Override
  public ResponseEntity<Void> accountCreateTokenConfirmGet(String token) {
    return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
  }

  @Override
  public ResponseEntity<Void> accountLogoutGet() {
    // Clear the Authorization cookie on logout
    ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
    String origin = null;
    if (attrs != null) {
      origin = attrs.getRequest().getHeader("Origin");
    }

    // Logout cookie: same logic for SameSite and Secure as login
    boolean isLocalHttpLogout = origin != null && (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"));
    boolean isSecureLogout = !isLocalHttpLogout;
    String sameSiteLogout = isSecureLogout ? "None" : "Lax";

    ResponseCookie.ResponseCookieBuilder cookieBuilder = ResponseCookie.from("Authorization", "")
      .httpOnly(true)
      .sameSite(sameSiteLogout)
      .path("/")
      .maxAge(0)
      .secure(isSecureLogout);

    if (origin != null && (origin.contains("pianoml.org") || origin.contains("www.pianoml.org"))) {
      cookieBuilder = cookieBuilder.domain(".pianoml.org");
    }

    ResponseCookie cookie = cookieBuilder.build();
    return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).build();
  }

  @Override
  public ResponseEntity<Void> accountPasswordResetPost(AccountPasswordResetPostRequest accountPasswordResetPostRequest) {
    return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
  }

  @Override
  public ResponseEntity<AccountTokenRenewGet200Response> accountTokenRenewGet() {
    ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
    if (attrs == null) {
      return ResponseEntity.badRequest().build();
    }
    HttpServletRequest currentRequest = attrs.getRequest();
    String token = getJwtFromRequest(currentRequest);
    AccountTokenRenewGet200Response accountTokenRenewGet200Response = new AccountTokenRenewGet200Response();
    try {
      String newToken = accountService.renewToken(token);
      accountTokenRenewGet200Response.setToken(newToken);
      return ResponseEntity.ok(accountTokenRenewGet200Response);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().build();
    } catch (RuntimeException e) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }
  }

  @Override
  public ResponseEntity<UserApiInfo> accountUserinfoGet() {
    UserApiInfo userApiInfo = accountService.getUserApiInfoFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
    return ResponseEntity.ok(userApiInfo);
  }

  @Override
  public ResponseEntity<UserApiInfo> accountUserinfoPut(UserApiInfo userApiInfo) {
    accountService.updateUserInfo(userApiInfo);
    return new ResponseEntity<>(HttpStatus.OK);
  }
}
