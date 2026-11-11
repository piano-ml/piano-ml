package org.pianoml.backend.integration;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.SystemUsers;
import org.pianoml.backend.entity.User;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /account endpoints through AccountService, the real security chain and JWTs, with the database mocked. */
class AccountIntegrationTest extends IntegrationTestBase {

  @Nested
  class CreateAccount {
    private final String signup = "{\"email\":\"new@example.com\",\"password\":\"s3cret-pass\",\"name\":\"Newbie\"}";

    @Test
    void storesTheUserWithAHashedPasswordAndTheUserRole() throws Exception {
      given(userRepository.findByEmail("new@example.com")).willReturn(Optional.empty());

      mockMvc.perform(post("/account/create").contentType(MediaType.APPLICATION_JSON).content(signup))
        .andExpect(status().isCreated());

      ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
      verify(userRepository).save(saved.capture());
      assertThat(saved.getValue().getEmail()).isEqualTo("new@example.com");
      assertThat(saved.getValue().getName()).isEqualTo("Newbie");
      assertThat(saved.getValue().getRoles()).isEqualTo("USER");
      assertThat(saved.getValue().isVerified()).isFalse();
      assertThat(saved.getValue().getPassword()).isNotEqualTo("s3cret-pass");
      assertThat(passwordEncoder.matches("s3cret-pass", saved.getValue().getPassword())).isTrue();
    }

    @Test
    void refusesAnEmailAlreadyRegistered() throws Exception {
      given(userRepository.findByEmail("new@example.com")).willReturn(Optional.of(user("Existing", "USER")));

      mockMvc.perform(post("/account/create").contentType(MediaType.APPLICATION_JSON).content(signup))
        .andExpect(status().isConflict());

      verify(userRepository, never()).save(any());
    }
  }

  @Nested
  class Login {
    private User alice;

    private void storedWithPassword(String password) {
      alice = user("Alice", "USER");
      alice.setPassword(passwordEncoder.encode(password));
      given(userRepository.findByEmail(alice.getEmail())).willReturn(Optional.of(alice));
    }

    private String loginBody(String password) {
      return json(Map.of("email", "alice@example.com", "password", password));
    }

    @Test
    void returnsAValidTokenAndSetsTheHttpOnlyAuthCookie() throws Exception {
      storedWithPassword("right-password");

      MvcResult result = mockMvc.perform(post("/account/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("right-password")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.userId").value(alice.getId().toString()))
        .andExpect(jsonPath("$.username").value("Alice"))
        .andExpect(jsonPath("$.roles").value("USER"))
        .andReturn();

      String token = objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
      assertThat(jwtTokenProvider.validateToken(token)).isTrue();
      assertThat(jwtTokenProvider.getUserIdFromJWT(token)).isEqualTo(alice.getId().toString());
      assertThat(result.getResponse().getHeaders("Set-Cookie"))
        .anySatisfy(cookie -> assertThat(cookie).startsWith("Authorization=" + token).contains("HttpOnly", "Secure", "SameSite=Strict"));
    }

    @Test
    void refusesAWrongPassword() throws Exception {
      storedWithPassword("right-password");

      mockMvc.perform(post("/account/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("wrong")))
        .andExpect(status().isForbidden());
    }

    @Test
    void refusesAnUnknownEmailTheSameWay() throws Exception {
      given(userRepository.findByEmail("alice@example.com")).willReturn(Optional.empty());

      mockMvc.perform(post("/account/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("whatever")))
        .andExpect(status().isForbidden());
    }
  }

  @Test
  void logoutClearsTheAuthCookie() throws Exception {
    MvcResult result = mockMvc.perform(post("/account/logout").with(csrf()))
      .andExpect(status().isOk())
      .andReturn();
    assertThat(result.getResponse().getHeaders("Set-Cookie"))
      .anySatisfy(cookie -> assertThat(cookie).startsWith("Authorization=;").contains("Max-Age=0"));
  }

  @Nested
  class UserInfo {
    @Test
    void returnsTheLoggedInUser() throws Exception {
      User bob = user("Bob", "USER");

      mockMvc.perform(get("/account/userinfo").header("Authorization", bearer(bob)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(bob.getId().toString()))
        .andExpect(jsonPath("$.email").value("bob@example.com"))
        .andExpect(jsonPath("$.name").value("Bob"))
        .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void worksWithTheAuthCookieToo() throws Exception {
      User bob = user("Bob", "USER");
      String token = bearer(bob).substring("Bearer ".length());

      mockMvc.perform(get("/account/userinfo").cookie(new Cookie("Authorization", token)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Bob"));
    }

    @Test
    void isUnauthorizedWithoutLogin() throws Exception {
      mockMvc.perform(get("/account/userinfo")).andExpect(status().isUnauthorized());
    }

    @Test
    void isUnauthorizedWhenTheTokenUserNoLongerExists() throws Exception {
      User ghost = user("Ghost", "USER");
      String header = "Bearer " + jwtTokenProvider.generateToken(ghost); // repository does not know this user

      mockMvc.perform(get("/account/userinfo").header("Authorization", header)).andExpect(status().isUnauthorized());
    }

    @Test
    void renamesTheUser() throws Exception {
      User bob = user("Bob", "USER");

      mockMvc.perform(put("/account/userinfo").header("Authorization", bearer(bob))
          .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Robert\"}"))
        .andExpect(status().isOk());

      ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
      verify(userRepository).save(saved.capture());
      assertThat(saved.getValue().getId()).isEqualTo(bob.getId());
      assertThat(saved.getValue().getName()).isEqualTo("Robert");
    }

    @Test
    void renamingNeedsALogin() throws Exception {
      mockMvc.perform(put("/account/userinfo").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"X\"}"))
        .andExpect(status().isUnauthorized());
      verify(userRepository, never()).save(any());
    }
  }

  @Nested
  class DeleteAccount {
    @Test
    void movesTheScoresToTheJunkUserThenDeletesTheUser() throws Exception {
      User carol = user("Carol", "USER");
      given(userRepository.existsById(SystemUsers.JUNK_ID)).willReturn(true);
      given(scoreRepository.reassignOwner(carol.getId(), SystemUsers.JUNK_ID)).willReturn(3);

      MvcResult result = mockMvc.perform(post("/account/delete").header("Authorization", bearer(carol)))
        .andExpect(status().isNoContent())
        .andReturn();

      var order = org.mockito.Mockito.inOrder(scoreRepository, userRepository);
      order.verify(scoreRepository).reassignOwner(carol.getId(), SystemUsers.JUNK_ID);
      order.verify(userRepository).delete(carol);
      assertThat(result.getResponse().getHeaders("Set-Cookie")).anySatisfy(c -> assertThat(c).startsWith("Authorization=;"));
    }

    @Test
    void refusesToDeleteTheJunkSystemUser() throws Exception {
      User junk = user("Junk", "USER");
      junk.setId(SystemUsers.JUNK_ID);

      mockMvc.perform(post("/account/delete").header("Authorization", bearer(junk)))
        .andExpect(status().isInternalServerError());
      verify(scoreRepository, never()).reassignOwner(any(), any());
      verify(userRepository, never()).delete(any());
    }

    @Test
    void deletesNothingWhenTheJunkUserIsMissing() throws Exception {
      User carol = user("Carol", "USER");
      given(userRepository.existsById(SystemUsers.JUNK_ID)).willReturn(false);

      mockMvc.perform(post("/account/delete").header("Authorization", bearer(carol)))
        .andExpect(status().isInternalServerError());
      verify(scoreRepository, never()).reassignOwner(any(), any());
      verify(userRepository, never()).delete(any());
    }

    @Test
    void needsALogin() throws Exception {
      mockMvc.perform(post("/account/delete").with(csrf())).andExpect(status().isUnauthorized());
    }
  }

  @Nested
  class TokenRenew {
    @Test
    void issuesAFreshTokenForTheSameUser() throws Exception {
      User dave = user("Dave", "USER");

      MvcResult result = mockMvc.perform(get("/account/token/renew").header("Authorization", bearer(dave)))
        .andExpect(status().isOk())
        .andReturn();

      String token = objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
      assertThat(jwtTokenProvider.getUserIdFromJWT(token)).isEqualTo(dave.getId().toString());
    }

    @Test
    void isUnauthorizedWithAnInvalidToken() throws Exception {
      mockMvc.perform(get("/account/token/renew").header("Authorization", "Bearer not-a-jwt"))
        .andExpect(status().isUnauthorized());
    }

    @Test
    void isUnauthorizedWhenTheUserIsGone() throws Exception {
      User ghost = user("Ghost", "USER");
      mockMvc.perform(get("/account/token/renew").header("Authorization", "Bearer " + jwtTokenProvider.generateToken(ghost)))
        .andExpect(status().isUnauthorized());
    }

    @Test
    void isABadRequestWithoutToken() throws Exception {
      mockMvc.perform(get("/account/token/renew")).andExpect(status().isBadRequest());
    }
  }

  @Test
  void emailConfirmationAndPasswordResetAreNotImplemented() throws Exception {
    mockMvc.perform(get("/account/create/some-token/confirm")).andExpect(status().isNotImplemented());
    mockMvc.perform(post("/account/password_reset").with(csrf()).header("Authorization", bearer(user("Eve", "USER")))
        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"eve@example.com\"}"))
      .andExpect(status().isNotImplemented());
  }

  @Test
  void unexpectedErrorsDoNotSendTheStackTraceToTheClient() throws Exception {
    User junk = user("Junk", "USER");
    junk.setId(SystemUsers.JUNK_ID); // deleting it fails with an IllegalStateException (500)

    mockMvc.perform(post("/account/delete").header("Authorization", bearer(junk)))
      .andExpect(status().isInternalServerError())
      .andExpect(jsonPath("$.error.message").value("System users cannot be deleted"))
      .andExpect(jsonPath("$.error.stacktrace", org.hamcrest.Matchers.empty())); // the trace stays in the server log
  }
}
