package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.AccountLoginPost200Response;
import org.pianoml.backend.model.AccountLoginPostRequest;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.AccountService;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Guards in AccountController for calls made outside an HTTP request (no RequestContextHolder attributes),
 * which the MVC tests cannot reach.
 */
class AccountControllerNoRequestContextTest {

  private final AccountService accountService = mock(AccountService.class);
  private final JwtTokenProvider jwtTokenProvider = mock(JwtTokenProvider.class);
  private AccountController controller;

  @AfterEach
  void cleanup() {
    RequestContextHolder.resetRequestAttributes();
  }

  @BeforeEach
  void setup() {
    RequestContextHolder.resetRequestAttributes();
    controller = new AccountController();
    ReflectionTestUtils.setField(controller, "accountService", accountService);
    ReflectionTestUtils.setField(controller, "jwtTokenProvider", jwtTokenProvider);
  }

  @Test
  void renewToken_withoutRequest_returns400() {
    assertThat(controller.accountTokenRenewGet().getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
  }

  @Test
  void login_withoutResponse_refusesToSilentlyDropTheCookie() {
    AccountLoginPost200Response response = new AccountLoginPost200Response();
    response.setToken("jwt");
    when(accountService.loginUser(any(AccountLoginPostRequest.class))).thenReturn(response);

    IllegalStateException ex = assertThrows(IllegalStateException.class,
      () -> controller.accountLoginPost(new AccountLoginPostRequest()));
    assertThat(ex).hasMessageContaining("No current HTTP response");
  }

  @Test
  void login_withRequestButNoResponse_refusesToSilentlyDropTheCookie() {
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
    AccountLoginPost200Response response = new AccountLoginPost200Response();
    response.setToken("jwt");
    when(accountService.loginUser(any(AccountLoginPostRequest.class))).thenReturn(response);

    assertThrows(IllegalStateException.class, () -> controller.accountLoginPost(new AccountLoginPostRequest()));
  }
}
