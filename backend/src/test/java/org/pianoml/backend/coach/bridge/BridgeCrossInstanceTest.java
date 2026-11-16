package org.pianoml.backend.coach.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.PianoMLApplication;
import org.pianoml.backend.coach.CoachToolResult;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two server instances on one database (issue #414): the tab's socket is held by one, the MCP call runs on the
 * other, and the command crosses through the coach_command row and the polling pump. The second instance also
 * renews its sockets after 2 seconds.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BridgeCrossInstanceTest {

  private static ConfigurableApplicationContext other;
  private static int otherPort;

  @Autowired private PlayerBridge bridge;
  @Autowired private BridgeSessions sessions;
  @Autowired private UserRepository userRepository;
  @Autowired private JdbcTemplate jdbc;

  private final List<UUID> users = new ArrayList<>();

  @BeforeAll
  static void startAnotherInstance() {
    other = new SpringApplicationBuilder(PianoMLApplication.class)
      .properties("server.port=0", "coach.bridge.max-age=PT2S")
      .run();
    otherPort = ((WebServerApplicationContext) other).getWebServer().getPort();
  }

  @AfterAll
  static void stopIt() {
    other.close();
  }

  @AfterEach
  void cleanup() {
    for (UUID id : users) {
      jdbc.update("DELETE FROM pianoml.coach_command WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_presence WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_ws_ticket WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", id);
    }
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("pianist");
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    users.add(saved.getId());
    return saved;
  }

  @Test
  void aCommandSentOnOneInstance_reachesATabHeldByTheOther() throws Exception {
    User user = newUser();
    // The ticket may be issued by any instance: it is a database row
    String ticket = other.getBean(BridgeTicketService.class).issue(user.getId()).orElseThrow().value();
    try (TestTab tab = TestTab.ready(otherPort, ticket)) {
      assertThat(sessions.isLocal(tab.tabId)).as("the socket is on the other instance").isFalse();
      assertThat(jdbc.queryForObject("SELECT instance FROM pianoml.coach_presence WHERE tab_id = ?", String.class, tab.tabId))
        .isEqualTo(other.getBean(BridgeSessions.class).instance()).isNotEqualTo(sessions.instance());

      CompletableFuture<CoachToolResult> pending = CompletableFuture.supplyAsync(() ->
        bridge.send(user.getId(), UUID.randomUUID(), "Host", "get_player_state", "{}", 8));
      JsonNode command = tab.answerNext(Map.of("ok", true, "data", Map.of("loaded", true)));
      assertThat(command.path("tool").asText()).isEqualTo("get_player_state");
      assertThat(pending.get(15, TimeUnit.SECONDS).data()).isEqualTo(Map.of("loaded", true));
    }
  }

  @Test
  void aSocketIsClosedForRenewalAtItsMaximumAge() throws Exception {
    User user = newUser();
    String ticket = other.getBean(BridgeTicketService.class).issue(user.getId()).orElseThrow().value();
    try (TestTab tab = TestTab.ready(otherPort, ticket)) {
      assertThat(tab.closeStatus().getCode()).isEqualTo(4000);
    }
  }
}
