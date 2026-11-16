package org.pianoml.backend.coach.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.coach.CoachToolResult;
import org.pianoml.backend.coach.McpTestClient;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.socket.CloseStatus;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The Remote coach bridge, server side (issue #414, phase 7), on a real port with a real WebSocket client. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "coach.bridge.hello-timeout=PT1S")
@AutoConfigureMockMvc
class BridgeTest {

  @LocalServerPort private int port;
  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private BridgeTicketService tickets;
  @Autowired private PlayerBridge bridge;
  @Autowired private CoachGrantService grants;

  private final List<UUID> users = new ArrayList<>();
  private final List<TestTab> tabs = new ArrayList<>();

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM pianoml.coach_command");
  }

  @AfterEach
  void cleanup() throws Exception {
    for (TestTab tab : tabs) {
      tab.close();
    }
    Thread.sleep(100);
    for (UUID id : users) {
      jdbc.update("DELETE FROM pianoml.coach_command WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_presence WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_ws_ticket WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_audit WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_grant WHERE user_id = ?", id);
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

  private String ticket(User user) {
    return tickets.issue(user.getId()).orElseThrow().value();
  }

  private TestTab ready(User user) throws Exception {
    TestTab tab = TestTab.ready(port, ticket(user));
    tabs.add(tab);
    return tab;
  }

  private TestTab connect(String origin) throws Exception {
    TestTab tab = TestTab.connect(port, origin);
    tabs.add(tab);
    return tab;
  }

  private CompletableFuture<CoachToolResult> sendAsync(User user, String tool, String args, int waitSeconds) {
    return CompletableFuture.supplyAsync(() -> bridge.send(user.getId(), UUID.randomUUID(), "Test host", tool, args, waitSeconds));
  }

  private RequestPostProcessor xsrf() throws Exception {
    String token = mockMvc.perform(get("/author/search/{q}", "x")).andReturn().getResponse().getHeaders("Set-Cookie")
      .stream().filter(h -> h.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow()
      .split(";")[0].substring("XSRF-TOKEN=".length());
    return request -> {
      Cookie[] existing = request.getCookies() == null ? new Cookie[0] : request.getCookies();
      Cookie[] cookies = Arrays.copyOf(existing, existing.length + 1);
      cookies[existing.length] = new Cookie("XSRF-TOKEN", token);
      request.setCookies(cookies);
      request.addHeader("X-XSRF-TOKEN", token);
      return request;
    };
  }

  // --- tickets ----------------------------------------------------------------------------------------------------

  @Test
  void ticketRoute_needsTheSessionAndCsrf_andIsRateLimited() throws Exception {
    mockMvc.perform(post("/coach/bridge/ticket").with(xsrf())).andExpect(status().isUnauthorized());
    User user = newUser();
    Cookie session = new Cookie("Authorization", jwtTokenProvider.generateToken(user));
    mockMvc.perform(post("/coach/bridge/ticket").cookie(session)).andExpect(status().isForbidden());
    String body = mockMvc.perform(post("/coach/bridge/ticket").with(xsrf()).cookie(session))
      .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    JsonNode ticket = TestTab.JSON.readTree(body);
    assertThat(ticket.path("ticket").asText()).matches("[A-Za-z0-9_-]{43}");
    assertThat(ticket.path("expiresInSeconds").asInt()).isEqualTo(30);
    assertThat(jdbc.queryForList("SELECT ticket_hash FROM pianoml.coach_ws_ticket WHERE user_id = ?", String.class, user.getId()))
      .noneMatch(hash -> hash.contains(ticket.path("ticket").asText()));
    for (int i = 0; i < 9; i++) {
      mockMvc.perform(post("/coach/bridge/ticket").with(xsrf()).cookie(session)).andExpect(status().isOk());
    }
    mockMvc.perform(post("/coach/bridge/ticket").with(xsrf()).cookie(session)).andExpect(status().isTooManyRequests());
  }

  @Test
  void ticket_isSingleUse_andExpires() {
    User user = newUser();
    String value = ticket(user);
    assertThat(tickets.consume(value)).contains(user.getId());
    assertThat(tickets.consume(value)).isEmpty();
    String expired = ticket(user);
    jdbc.update("UPDATE pianoml.coach_ws_ticket SET expires_at = DATEADD('SECOND', -1, CURRENT_TIMESTAMP) WHERE user_id = ?", user.getId());
    assertThat(tickets.consume(expired)).isEmpty();
    assertThat(tickets.consume("not-a-ticket")).isEmpty();
  }

  // --- handshake and socket ---------------------------------------------------------------------------------------

  @Test
  void handshake_refusesAnOriginNotAllowedByCors_andAcceptsNoOrigin() throws Exception {
    assertThatThrownBy(() -> connect("https://evil.example")).isInstanceOf(ExecutionException.class);
    assertThat(connect("https://www.pianoml.org").session.isOpen()).isTrue();
    assertThat(connect(null).session.isOpen()).isTrue();
  }

  @Test
  void aSocketWithoutHello_isClosedAfterTheTimeout() throws Exception {
    assertThat(connect(null).closeStatus().getCode()).isEqualTo(4408);
  }

  @Test
  void aBadOrReusedTicket_orAnyFrameBeforeHello_closesWith4401() throws Exception {
    User user = newUser();
    TestTab bad = connect(null);
    bad.send(Map.of("type", "hello", "ticket", "nope", "tabId", bad.tabId.toString()));
    assertThat(bad.closeStatus().getCode()).isEqualTo(4401);

    String ticket = ticket(user);
    TestTab first = TestTab.ready(port, ticket);
    tabs.add(first);
    TestTab reused = connect(null);
    reused.send(Map.of("type", "hello", "ticket", ticket, "tabId", reused.tabId.toString()));
    assertThat(reused.closeStatus().getCode()).isEqualTo(4401);

    TestTab early = connect(null);
    early.send(Map.of("type", "ping"));
    assertThat(early.closeStatus().getCode()).isEqualTo(4401);

    TestTab garbage = connect(null);
    garbage.sendRaw("{not json");
    assertThat(garbage.closeStatus().getCode()).isEqualTo(4401);

    TestTab badTab = connect(null);
    badTab.send(Map.of("type", "hello", "ticket", ticket(user), "tabId", "not-a-uuid"));
    assertThat(badTab.closeStatus().getCode()).isEqualTo(4401);

    first.send(Map.of("type", "launch-missiles"));
    assertThat(first.closeStatus().getCode()).isEqualTo(4401);
  }

  @Test
  void aFourthSocket_isRefused_andATabIdOfAnotherUserToo() throws Exception {
    User user = newUser();
    ready(user);
    ready(user);
    ready(user);
    TestTab fourth = connect(null);
    fourth.send(Map.of("type", "hello", "ticket", ticket(user), "tabId", fourth.tabId.toString()));
    assertThat(fourth.closeStatus().getCode()).isEqualTo(4429);

    TestTab mine = ready(newUser());
    TestTab thief = connect(null);
    thief.send(Map.of("type", "hello", "ticket", ticket(newUser()), "tabId", mine.tabId.toString()));
    assertThat(thief.closeStatus().getCode()).isEqualTo(4401);
  }

  @Test
  void anOversizedFrame_closesTheSocket() throws Exception {
    TestTab tab = ready(newUser());
    tab.sendRaw("{\"type\":\"ping\",\"pad\":\"" + "x".repeat(70_000) + "\"}");
    assertThat(tab.closeStatus().getCode()).isEqualTo(CloseStatus.TOO_BIG_TO_PROCESS.getCode());
  }

  @Test
  void ping_keepsThePresenceAlive_andClosingRemovesIt() throws Exception {
    User user = newUser();
    TestTab tab = ready(user);
    assertThat(bridge.connectedTabs(user.getId())).isEqualTo(1);
    tab.send(Map.of("type", "ping"));
    assertThat(tab.next().path("type").asText()).isEqualTo("pong");
    tab.close();
    tab.closeStatus();
    Thread.sleep(200);
    assertThat(bridge.connectedTabs(user.getId())).isZero();
  }

  // --- commands ---------------------------------------------------------------------------------------------------

  @Test
  void send_withoutATab_isNoActivePlayer_withTheLink() {
    CoachToolResult result = bridge.send(newUser().getId(), UUID.randomUUID(), "Host", "get_player_state", "{}", 2);
    assertThat(result.code()).isEqualTo("NO_ACTIVE_PLAYER");
    assertThat(result.message()).contains("https://www.pianoml.org/?remoteCoach=1");
  }

  @Test
  void send_refusesAServerTool() {
    assertThatThrownBy(() -> bridge.send(newUser().getId(), UUID.randomUUID(), "Host", "get_practice_summary", "{}", 2))
      .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void aCommand_roundTripsThroughTheTab() throws Exception {
    User user = newUser();
    TestTab tab = ready(user);
    CompletableFuture<CoachToolResult> pending = sendAsync(user, "configure_practice", "{\"loop\":true}", 5);
    JsonNode command = tab.answerNext(Map.of("ok", true, "data", Map.of("loop", true)));
    assertThat(command.path("tool").asText()).isEqualTo("configure_practice");
    assertThat(command.path("args").path("loop").asBoolean()).isTrue();
    assertThat(command.path("client").asText()).isEqualTo("Test host");

    CoachToolResult result = pending.get(10, TimeUnit.SECONDS);
    assertThat(result.ok()).isTrue();
    assertThat(result.data()).isEqualTo(Map.of("loop", true));
    assertThat(jdbc.queryForObject("SELECT status FROM pianoml.coach_command WHERE id = ?", String.class,
      UUID.fromString(command.path("id").asText()))).isEqualTo("done");

    CompletableFuture<CoachToolResult> refused = sendAsync(user, "play", "{}", 5);
    tab.answerNext(Map.of("ok", false, "code", "AUDIO_LOCKED", "message", "Press Start playback."));
    assertThat(refused.get(10, TimeUnit.SECONDS)).isEqualTo(CoachToolResult.error("AUDIO_LOCKED", "Press Start playback."));
  }

  @Test
  void resultsFromAnotherUserOrAnotherTab_areIgnored() throws Exception {
    User user = newUser();
    TestTab target = ready(user);
    TestTab sameUserOtherTab = ready(user);
    target.send(Map.of("type", "focus"));
    Thread.sleep(50);
    TestTab otherUser = ready(newUser());

    CompletableFuture<CoachToolResult> pending = sendAsync(user, "get_player_state", "{}", 5);
    JsonNode command = target.next();
    String id = command.path("id").asText();
    Map<String, Object> forged = Map.of("type", "result", "id", id, "result", Map.of("ok", true, "data", "forged"));
    otherUser.send(forged);
    sameUserOtherTab.send(forged);
    Thread.sleep(400);
    assertThat(pending).isNotDone();
    target.send(Map.of("type", "result", "id", id, "result", Map.of("ok", true, "data", "real")));
    assertThat(pending.get(10, TimeUnit.SECONDS).data()).isEqualTo("real");
    assertThat(sameUserOtherTab.next(300)).isNull();
  }

  @Test
  void theMostRecentlyFocusedTab_receivesTheCommand() throws Exception {
    User user = newUser();
    TestTab first = ready(user);
    TestTab second = ready(user);
    first.send(Map.of("type", "focus"));
    Thread.sleep(100);
    CompletableFuture<CoachToolResult> pending = sendAsync(user, "stop", "{}", 5);
    first.answerNext(Map.of("ok", true, "data", "stopped"));
    assertThat(pending.get(10, TimeUnit.SECONDS).ok()).isTrue();
    assertThat(second.next(300)).isNull();
  }

  @Test
  void aTabThatDoesNotAnswer_isAPlayerTimeout() throws Exception {
    User user = newUser();
    TestTab tab = ready(user);
    CoachToolResult result = sendAsync(user, "get_player_state", "{}", 1).get(10, TimeUnit.SECONDS);
    assertThat(result.code()).isEqualTo("PLAYER_TIMEOUT");
    JsonNode command = tab.next();
    assertThat(jdbc.queryForObject("SELECT status FROM pianoml.coach_command WHERE id = ?", String.class,
      UUID.fromString(command.path("id").asText()))).isEqualTo("expired");
    // A late answer changes nothing
    tab.send(Map.of("type", "result", "id", command.path("id").asText(), "result", Map.of("ok", true, "data", 1)));
    Thread.sleep(200);
    assertThat(jdbc.queryForObject("SELECT status FROM pianoml.coach_command WHERE id = ?", String.class,
      UUID.fromString(command.path("id").asText()))).isEqualTo("expired");
  }

  @Test
  void aForgedCommandRow_forAnotherUsersTab_isNeverDelivered() throws Exception {
    User victim = newUser();
    TestTab tab = ready(victim);
    User attacker = newUser();
    jdbc.update("INSERT INTO pianoml.coach_command (id, user_id, tab_id, grant_id, client_name, tool, args, status, created_at, expires_at)"
        + " VALUES (?, ?, ?, ?, 'forged', 'play', '{}', 'pending', CURRENT_TIMESTAMP, DATEADD('SECOND', 30, CURRENT_TIMESTAMP))",
      UUID.randomUUID(), attacker.getId(), tab.tabId, UUID.randomUUID());
    assertThat(tab.next(1500)).as("the pump must not deliver it").isNull();
  }

  @Test
  void getContext_reportsTheConnectedTabs() throws Exception {
    User user = newUser();
    String token = grants.create(user, "Host", List.of("player:control"), 30).token();
    McpTestClient mcp = new McpTestClient(mockMvc);
    assertThat(mcp.data(token, "get_context", Map.of()).path("player").path("connectedTabs").asInt()).isZero();
    ready(user);
    assertThat(mcp.data(token, "get_context", Map.of()).path("player").path("connectedTabs").asInt()).isEqualTo(1);
  }
}
