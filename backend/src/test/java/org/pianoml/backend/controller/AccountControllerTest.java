package org.pianoml.backend.controller;

import org.junit.jupiter.api.Test;
import org.pianoml.backend.exception.UserAlreadyExistsException;
import org.pianoml.backend.exception.UserNotLoggedInException;
import org.pianoml.backend.model.AccountCreatePostRequest;
import org.pianoml.backend.model.AccountLoginPost200Response;
import org.pianoml.backend.model.AccountLoginPostRequest;
import org.pianoml.backend.model.UserApiInfo;
import org.pianoml.backend.service.AccountService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AccountController endpoints and the RestExceptionHandler mappings, through the real MVC and security stack,
 * with AccountService mocked. Cookie attributes and CSRF behaviour are covered by CsrfProtectionTest.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AccountControllerTest {

  private static final String SIGNUP = "{\"email\":\"a@example.com\",\"password\":\"pw\",\"name\":\"a\"}";
  private static final String LOGIN = "{\"email\":\"a@example.com\",\"password\":\"pw\"}";

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private AccountService accountService;

  // --- create account -------------------------------------------------------------------------------------

  @Test
  void createAccount_returns201() throws Exception {
    mockMvc.perform(post("/account/create").contentType(MediaType.APPLICATION_JSON).content(SIGNUP))
      .andExpect(status().isCreated());
    verify(accountService).createUser(any(AccountCreatePostRequest.class));
  }

  @Test
  void createAccount_existingEmail_returns409_viaRestExceptionHandler() throws Exception {
    willThrow(new UserAlreadyExistsException("User with email a@example.com already exists."))
      .given(accountService).createUser(any(AccountCreatePostRequest.class));

    mockMvc.perform(post("/account/create").contentType(MediaType.APPLICATION_JSON).content(SIGNUP))
      .andExpect(status().isConflict())
      .andExpect(content().string("User with email a@example.com already exists."));
  }

  // --- login ----------------------------------------------------------------------------------------------

  @Test
  void login_withoutTokenFromService_returns500_andSetsNoAuthCookie() throws Exception {
    given(accountService.loginUser(any(AccountLoginPostRequest.class))).willReturn(new AccountLoginPost200Response());

    mockMvc.perform(post("/account/login").contentType(MediaType.APPLICATION_JSON).content(LOGIN))
      .andExpect(status().isInternalServerError())
      .andExpect(result -> org.assertj.core.api.Assertions.assertThat(result.getResponse().getHeaders("Set-Cookie"))
        .noneMatch(h -> h.startsWith("Authorization=")));
  }

  @Test
  void login_withBlankTokenFromService_returns500() throws Exception {
    AccountLoginPost200Response blank = new AccountLoginPost200Response();
    blank.setToken("  ");
    given(accountService.loginUser(any(AccountLoginPostRequest.class))).willReturn(blank);

    mockMvc.perform(post("/account/login").contentType(MediaType.APPLICATION_JSON).content(LOGIN))
      .andExpect(status().isInternalServerError());
  }

  // --- not implemented endpoints --------------------------------------------------------------------------

  @Test
  void confirmAccountToken_isNotImplemented() throws Exception {
    mockMvc.perform(get("/account/create/{token}/confirm", "abc"))
      .andExpect(status().isNotImplemented());
  }

  @Test
  void passwordReset_isNotImplemented() throws Exception {
    mockMvc.perform(post("/account/password_reset").with(user("u")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"a@example.com\"}"))
      .andExpect(status().isNotImplemented());
  }

  // --- token renew ----------------------------------------------------------------------------------------

  @Test
  void renewToken_returnsNewToken() throws Exception {
    given(accountService.renewToken("old")).willReturn("new");

    mockMvc.perform(get("/account/token/renew").header("Authorization", "Bearer old"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.token").value("new"));
  }

  @Test
  void renewToken_missingToken_returns400() throws Exception {
    given(accountService.renewToken(null)).willThrow(new IllegalArgumentException("token is required"));

    mockMvc.perform(get("/account/token/renew"))
      .andExpect(status().isBadRequest());
  }

  @Test
  void renewToken_invalidToken_returns401() throws Exception {
    given(accountService.renewToken("bad")).willThrow(new RuntimeException("Invalid or expired token"));

    mockMvc.perform(get("/account/token/renew").header("Authorization", "Bearer bad"))
      .andExpect(status().isUnauthorized());
  }

  // --- user info ------------------------------------------------------------------------------------------

  @Test
  void userInfoGet_returnsCurrentUser() throws Exception {
    UserApiInfo info = new UserApiInfo();
    info.setName("alice");
    info.setRoles("USER");
    given(accountService.getUserApiInfoFromAuthentication(any())).willReturn(info);

    mockMvc.perform(get("/account/userinfo").with(user("alice")))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.name").value("alice"))
      .andExpect(jsonPath("$.roles").value("USER"));
  }

  @Test
  void userInfoGet_notLoggedIn_returns401_viaRestExceptionHandler() throws Exception {
    given(accountService.getUserApiInfoFromAuthentication(any()))
      .willThrow(new UserNotLoggedInException("user not logged in"));

    mockMvc.perform(get("/account/userinfo"))
      .andExpect(status().isUnauthorized())
      .andExpect(content().string("user not logged in"));
  }

  @Test
  void userInfoPut_updatesAndReturns200() throws Exception {
    mockMvc.perform(put("/account/userinfo").with(user("alice")).with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"bob\"}"))
      .andExpect(status().isOk());
    verify(accountService).updateUserInfo(eq(new UserApiInfo().name("bob")));
  }

  @Test
  void userInfoPut_withoutAuthentication_returns401() throws Exception {
    mockMvc.perform(put("/account/userinfo").with(csrf())
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"bob\"}"))
      .andExpect(status().isUnauthorized())
      .andExpect(header().doesNotExist("Set-Cookie"));
  }
}
