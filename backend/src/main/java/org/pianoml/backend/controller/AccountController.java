package org.pianoml.backend.controller;

import org.pianoml.backend.security.OriginAwareCsrfTokenRepository;

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

    ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
    appendSetCookie(attrs, expireLegacySharedAuthCookie());
    ResponseCookie cookie = authCookie(token, jwtTokenProvider.getJwtExpirationInMs() / 1000);
    appendSetCookie(attrs, cookie);
    return ResponseEntity.ok().body(response);
  }

  @Override
  public ResponseEntity<Void> accountCreateTokenConfirmGet(String token) {
    return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
  }

  @Override
  public ResponseEntity<Void> accountDeletePost() {
    accountService.deleteCurrentUser(SecurityContextHolder.getContext().getAuthentication());
    ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
    appendSetCookie(attrs, authCookie("", 0));
    appendSetCookie(attrs, expireLegacySharedAuthCookie());
    return ResponseEntity.noContent().build();
  }

  @Override
  public ResponseEntity<Void> accountLogoutPost() {
    ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
    appendSetCookie(attrs, authCookie("", 0));
    appendSetCookie(attrs, expireLegacySharedAuthCookie());
    return ResponseEntity.ok().build();
  }

  /**
   * Auth cookie policy: HttpOnly, Secure, SameSite=Strict, host-only (no Domain).
   *
   * <p>pianoml.org, www.pianoml.org and api.pianoml.org are the same site, so the SPA's XHR calls to the API
   * carry a Strict cookie; cross-site requests (forms, links, scripts on other sites) never do. Host-only keeps
   * the JWT on api.pianoml.org instead of sending it to every *.pianoml.org host.
   *
   * <p>Local development goes through the frontend dev proxy (frontend/proxy.conf.mjs), which strips the
   * Secure attribute so the cookie is accepted on http://localhost / http://127.0.0.1.
   */
  static ResponseCookie authCookie(String value, long maxAgeSeconds) {
    // RFC 6265 forbids spaces in cookie values: store the raw token (no "Bearer " prefix).
    return ResponseCookie.from("Authorization", value)
      .httpOnly(true)
      .secure(true)
      .sameSite("Strict")
      .path("/")
      .maxAge(maxAgeSeconds)
      .build();
  }

  /**
   * Until 2026-11, login set the auth cookie with Domain=.pianoml.org and SameSite=None. Expire that variant
   * on login and logout so a stale shared cookie cannot shadow the host-only one. Safe to remove once every
   * such cookie has expired (one JWT lifetime after this change is deployed).
   */
  static ResponseCookie expireLegacySharedAuthCookie() {
    return ResponseCookie.from("Authorization", "")
      .httpOnly(true)
      .secure(true)
      .sameSite("None")
      .domain(OriginAwareCsrfTokenRepository.SHARED_COOKIE_DOMAIN) // same cookie for browsers as ".pianoml.org"
      .path("/")
      .maxAge(0)
      .build();
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

  /**
   * Appends the cookie with addHeader. A ResponseEntity Set-Cookie header would replace every Set-Cookie
   * already on the response, dropping the XSRF-TOKEN cookie written by Spring Security's CSRF filter.
   */
  private static void appendSetCookie(ServletRequestAttributes attrs, ResponseCookie cookie) {
    if (attrs == null || attrs.getResponse() == null) {
      throw new IllegalStateException("No current HTTP response to set the cookie on");
    }
    attrs.getResponse().addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
  }
}
