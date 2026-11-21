package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** With coach.oauth.enabled=false (it is on by default): nothing OAuth answers, and no client is invited to sign in. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "coach.oauth.enabled=false")
class OAuthDisabledTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private UserRepository userRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private JdbcTemplate jdbc;
  private UUID userId;

  @AfterEach
  void cleanup() {
    if (userId != null) {
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", userId);
    }
  }

  private Cookie session() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("pianist-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    userId = saved.getId();
    return new Cookie("Authorization", jwtTokenProvider.generateToken(saved));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder mcp() {
    return post("/mcp").contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
      .content("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}");
  }

  @Test
  void theChallengePointsNowhere_andNoOAuthEndpointAnswers() throws Exception {
    mockMvc.perform(mcp()).andExpect(status().isUnauthorized())
      .andExpect(header().string("WWW-Authenticate", "Bearer realm=\"PianoML\""));
    mockMvc.perform(mcp().header("Authorization", "Bearer pml_nope")).andExpect(status().isUnauthorized())
      .andExpect(header().string("WWW-Authenticate", "Bearer realm=\"PianoML\", error=\"invalid_token\""));
    mockMvc.perform(get("/.well-known/oauth-protected-resource/mcp")).andExpect(status().isNotFound());
    mockMvc.perform(get("/.well-known/oauth-authorization-server")).andExpect(status().isNotFound());
    mockMvc.perform(post("/oauth/register").contentType(MediaType.APPLICATION_JSON)
        .content("{\"redirect_uris\":[\"https://harness.example/cb\"]}"))
      .andExpect(status().isNotFound());
    mockMvc.perform(get("/oauth/authorize").param("client_id", "pmc_x")).andExpect(status().isNotFound());
    mockMvc.perform(post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).param("grant_type", "refresh_token"))
      .andExpect(status().isNotFound());
    mockMvc.perform(get("/oauth/requests/{id}", "x").cookie(session())).andExpect(status().isNotFound());
  }
}
