package org.pianoml.backend.controller;

import org.pianoml.backend.api.AccountApi;
import org.pianoml.backend.model.*;
import org.pianoml.backend.service.AccountService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import jakarta.servlet.http.HttpServletRequest;

import static org.pianoml.backend.security.JwtAuthenticationFilter.getJwtFromRequest;

@RestController
public class AccountController implements AccountApi {

  @Autowired
  private AccountService accountService;

  @Override
  public ResponseEntity<Void> accountCreatePost(AccountCreatePostRequest accountCreatePostRequest) {
    accountService.createUser(accountCreatePostRequest);
    return new ResponseEntity<>(HttpStatus.CREATED);
  }

  @Override
  public ResponseEntity<AccountLoginPost200Response> accountLoginPost(AccountLoginPostRequest accountLoginPostRequest) {
    return ResponseEntity.ok(accountService.loginUser(accountLoginPostRequest));
  }

  @Override
  public ResponseEntity<Void> accountCreateTokenConfirmGet(String token) {
    return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
  }

  @Override
  public ResponseEntity<Void> accountLogoutGet() {
    return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
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
