package org.pianoml.backend.coach.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.coach.McpTestClient;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The player tools on the MCP endpoint (issue #414, phase 9): an MCP call goes through the bridge to the user's
 * Remote coach tab, played here by a WebSocket test client, and its answer comes back as the tool result.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class CoachMcpPlayerToolsTest {

  /** A valid call of each browser tool. */
  private static final Map<String, Map<String, Object>> CALLS = new LinkedHashMap<>();
  static {
    CALLS.put("get_player_state", Map.of());
    CALLS.put("list_exercises", Map.of());
    CALLS.put("open_score", Map.of("slug", "prelude"));
    CALLS.put("open_exercise", Map.of("type", "scale", "patternKey", "major", "tonic", "C", "exerciseKey", "left_than_right"));
    CALLS.put("configure_practice", Map.of("fromMeasure", 1, "toMeasure", 2, "tempoPercent", 60, "loop", true));
    CALLS.put("play", Map.of("restart", true));
    CALLS.put("stop", Map.of());
    CALLS.put("wait_for_take_end", Map.of("timeoutSeconds", 5));
    CALLS.put("get_current_session", Map.of());
    CALLS.put("navigate", Map.of("page", "library"));
  }

  @LocalServerPort private int port;
  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private CoachGrantService grants;
  @Autowired private BridgeTicketService tickets;

  private McpTestClient mcp;
  private final List<UUID> users = new ArrayList<>();
  private final List<TestTab> tabs = new ArrayList<>();

  @BeforeEach
  void setUp() {
    mcp = new McpTestClient(mockMvc);
  }

  @AfterEach
  void cleanup() throws Exception {
    for (TestTab tab : tabs) {
      tab.close();
    }
    Thread.sleep(100);
    for (UUID id : users) {
      for (String table : List.of("coach_command", "coach_presence", "coach_ws_ticket", "coach_audit", "coach_grant")) {
        jdbc.update("DELETE FROM pianoml." + table + " WHERE user_id = ?", id);
      }
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", id);
    }
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("pianist-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    users.add(saved.getId());
    return saved;
  }

  private String token(User user, List<String> scopes) {
    return grants.create(user, "Laptop assistant", scopes, 30).token();
  }

  private TestTab tab(User user) throws Exception {
    TestTab tab = TestTab.ready(port, tickets.issue(user.getId()).orElseThrow().value());
    tabs.add(tab);
    return tab;
  }

  private CompletableFuture<JsonNode> callAsync(String token, String tool, Map<String, Object> args) {
    return CompletableFuture.supplyAsync(() -> {
      try {
        return mcp.call(token, tool, args);
      } catch (Exception e) {
        throw new IllegalStateException(e);
      }
    });
  }

  private int commandRows(User user) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_command WHERE user_id = ?", Integer.class, user.getId());
  }

  @Test
  void toolsList_servesAllThirtyToolsOfTheContract() throws Exception {
    JsonNode tools = mcp.listTools(token(newUser(), List.of("player:control")));
    List<String> names = StreamSupport.stream(tools.spliterator(), false).map(t -> t.path("name").asText()).toList();
    assertThat(names).hasSize(30).containsAll(CALLS.keySet());
  }

  @Test
  void everyBrowserTool_roundTripsThroughTheTab_withTheGrantInTheCommandRow() throws Exception {
    User user = newUser();
    String token = token(user, List.of("player:control"));
    TestTab tab = tab(user);
    for (Map.Entry<String, Map<String, Object>> call : CALLS.entrySet()) {
      CompletableFuture<JsonNode> pending = callAsync(token, call.getKey(), call.getValue());
      JsonNode command = tab.answerNext(Map.of("ok", true, "data", Map.of("tool", call.getKey())));
      assertThat(command.path("tool").asText()).isEqualTo(call.getKey());
      assertThat(command.path("client").asText()).isEqualTo("Laptop assistant");
      assertThat(TestTab.JSON.convertValue(command.path("args"), Map.class)).isEqualTo(call.getValue());
      JsonNode envelope = pending.get(15, TimeUnit.SECONDS);
      assertThat(envelope.path("ok").asBoolean()).as(call.getKey()).isTrue();
      assertThat(envelope.path("data").path("tool").asText()).isEqualTo(call.getKey());
    }
    UUID grantId = grants.list(user).get(0).getId();
    assertThat(jdbc.queryForList("SELECT DISTINCT CAST(grant_id AS VARCHAR) FROM pianoml.coach_command WHERE user_id = ?", String.class, user.getId()))
      .containsExactly(grantId.toString());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_audit WHERE grant_id = ? AND outcome = 'OK'", Integer.class, grantId))
      .isEqualTo(CALLS.size());
  }

  @Test
  void aRefusalOfTheTab_comesBackAsTheToolError() throws Exception {
    User user = newUser();
    String token = token(user, List.of("player:control"));
    TestTab tab = tab(user);
    CompletableFuture<JsonNode> pending = callAsync(token, "play", Map.of());
    tab.answerNext(Map.of("ok", false, "code", "AUDIO_LOCKED", "message", "Ask the student to press Start playback."));
    JsonNode envelope = pending.get(15, TimeUnit.SECONDS);
    assertThat(envelope.path("code").asText()).isEqualTo("AUDIO_LOCKED");
    assertThat(envelope.path("message").asText()).isEqualTo("Ask the student to press Start playback.");
  }

  @Test
  void withoutThePlayerScope_orWithInvalidArguments_nothingIsSentToTheTab() throws Exception {
    User user = newUser();
    TestTab tab = tab(user);
    JsonNode refused = mcp.call(token(user, List.of("practice:read")), "stop", Map.of());
    assertThat(refused.path("code").asText()).isEqualTo("FORBIDDEN_SCOPE");
    String token = token(user, List.of("player:control"));
    assertThat(mcp.call(token, "configure_practice", Map.of("tempoPercent", 500)).path("code").asText()).isEqualTo("INVALID_ARGUMENT");
    assertThat(mcp.call(token, "navigate", Map.of("page", "score_info", "slug", "../admin")).path("code").asText()).isEqualTo("INVALID_ARGUMENT");
    assertThat(mcp.call(token, "open_score", Map.of()).path("code").asText()).isEqualTo("INVALID_ARGUMENT");
    assertThat(commandRows(user)).isZero();
    assertThat(tab.next(300)).isNull();
  }

  @Test
  void withoutATab_theToolSaysSo_withTheLinkToTurnRemoteCoachOn() throws Exception {
    User user = newUser();
    JsonNode envelope = mcp.call(token(user, List.of("player:control")), "get_player_state", Map.of());
    assertThat(envelope.path("code").asText()).isEqualTo("NO_ACTIVE_PLAYER");
    assertThat(envelope.path("message").asText()).contains("https://pianoml.org/?remoteCoach=1");
  }

  @Test
  void anotherUsersTab_isNeverReached() throws Exception {
    User owner = newUser();
    TestTab ownersTab = tab(owner);
    User other = newUser();
    JsonNode envelope = mcp.call(token(other, List.of("player:control")), "play", Map.of());
    assertThat(envelope.path("code").asText()).isEqualTo("NO_ACTIVE_PLAYER");
    assertThat(ownersTab.next(500)).isNull();
  }

  @Test
  void waitForTakeEnd_givesTheTabItsWholeTimeout() throws Exception {
    User user = newUser();
    String token = token(user, List.of("player:control"));
    TestTab tab = tab(user);
    CompletableFuture<JsonNode> pending = callAsync(token, "wait_for_take_end", Map.of("timeoutSeconds", 5));
    JsonNode command = tab.next();
    Thread.sleep(6_000); // longer than timeoutSeconds: the bridge waits timeoutSeconds + 5
    tab.send(Map.of("type", "result", "id", command.path("id").asText(), "result", Map.of("ok", true, "data", Map.of("ended", false))));
    JsonNode envelope = pending.get(15, TimeUnit.SECONDS);
    assertThat(envelope.path("ok").asBoolean()).isTrue();
    assertThat(envelope.path("data").path("ended").asBoolean()).isFalse();
  }

  @Test
  void aSlowScoreLoad_isStillAnswered_afterTheSdkDefaultTimeout() throws Exception {
    User user = newUser();
    String token = token(user, List.of("player:control"));
    TestTab tab = tab(user);
    CompletableFuture<JsonNode> pending = callAsync(token, "open_score", Map.of("slug", "prelude"));
    JsonNode command = tab.next();
    Thread.sleep(12_000); // beyond the SDK's 10 s default request timeout
    tab.send(Map.of("type", "result", "id", command.path("id").asText(), "result", Map.of("ok", true, "data", Map.of("loaded", true))));
    assertThat(pending.get(20, TimeUnit.SECONDS).path("data").path("loaded").asBoolean()).isTrue();
  }
}
