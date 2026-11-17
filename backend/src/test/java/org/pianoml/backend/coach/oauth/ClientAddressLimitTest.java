package org.pianoml.backend.coach.oauth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Behind a proxy, the OAuth limits key on the forwarded client address, which a client cannot forge. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"coach.oauth.enabled=true", "coach.oauth.register.per-ip-per-hour=2",
  "coach.client-address.trusted-proxies=1"})
class ClientAddressLimitTest {

  private static final String PROXY = "169.254.1.1";

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  private final String run = UUID.randomUUID().toString().substring(0, 8);

  @AfterEach
  void cleanup() {
    jdbc.update("DELETE FROM pianoml.coach_oauth_client WHERE client_name LIKE ?", "%" + run + "%");
  }

  private ResultActions register(String forwardedFor) throws Exception {
    return mockMvc.perform(post("/oauth/register")
      .with(r -> {
        r.setRemoteAddr(PROXY);
        return r;
      })
      .header("X-Forwarded-For", forwardedFor)
      .contentType(MediaType.APPLICATION_JSON)
      .content("{\"client_name\":\"Limit " + run + "\",\"redirect_uris\":[\"https://harness.example/cb\"]}"));
  }

  @Test
  void clientsBehindTheSameProxy_haveTheirOwnLimit_andCannotForgeANewOne() throws Exception {
    register("203.0.113.10").andExpect(status().isCreated());
    register("203.0.113.10").andExpect(status().isCreated());
    // a forged entry on the left changes nothing: the proxy's entry is the last one
    register("9.9.9.9, 203.0.113.10").andExpect(status().isTooManyRequests());
    register("8.8.8.8, 203.0.113.10").andExpect(status().isTooManyRequests());
    // another client behind the same proxy is not affected
    register("203.0.113.11").andExpect(status().isCreated());
  }
}
