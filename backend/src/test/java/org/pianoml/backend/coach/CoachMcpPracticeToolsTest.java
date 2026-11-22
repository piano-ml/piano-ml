package org.pianoml.backend.coach;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The MCP endpoint and the practice tools 1 to 9 (coach, issue #414, phase 2), through real MCP JSON-RPC calls
 * on seeded practice sessions.
 */
@SpringBootTest
@AutoConfigureMockMvc
class CoachMcpPracticeToolsTest {

  /** Every tool of the contract is served since phase 9: the server tools and the browser tools. */
  private static final List<String> SERVER_TOOLS = List.of("get_context", "get_practice_summary", "get_practice_calendar",
    "list_practiced_items", "get_item_progress", "get_weak_spots", "get_key_stats", "get_practice_sessions", "get_practice_session",
    "search_scores", "get_score", "get_score_harmony", "get_score_videos", "list_my_scores", "list_composers",
    "search_composers", "get_composer", "list_genres", "list_keys", "recommend_scores",
    "get_player_state", "list_exercises", "open_score", "open_exercise", "configure_practice", "play", "stop",
    "wait_for_take_end", "get_current_session", "navigate");
  private static final List<String> ALL_SCOPES = List.of("practice:read", "scores:read", "player:control");

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private CoachGrantService grants;

  private final ObjectMapper json = new ObjectMapper();
  private McpTestClient mcp;
  private UUID authorId;
  private final List<UUID> createdUsers = new ArrayList<>();
  private final List<UUID> createdScores = new ArrayList<>();

  // The seeded history of `student`
  private User student;
  private String token;
  private UUID prelude;
  private UUID etude;
  private UUID preludeSession;

  @BeforeEach
  void seed() throws Exception {
    mcp = new McpTestClient(mockMvc);
    authorId = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.author (id, name) VALUES (?, ?)", authorId, "Composer " + authorId);

    student = newUser();
    token = token(student, ALL_SCOPES);
    prelude = newScore(student.getId(), "Prelude", "C", "major", 2f);
    etude = newScore(student.getId(), "Etude", "G", "major", 3f);

    preludeSession = UUID.randomUUID();
    putSession(UUID.randomUUID(), scoreSession(prelude, 60, false));
    putSession(preludeSession, scoreSession(prelude, 30, false));
    putSession(UUID.randomUUID(), scoreSession(etude, 20, true));
    putSession(UUID.randomUUID(), exerciseSession(10));
  }

  @AfterEach
  void cleanup() {
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.practice_session WHERE user_id = ?", userId);
      jdbc.update("DELETE FROM pianoml.coach_audit WHERE user_id = ?", userId);
      jdbc.update("DELETE FROM pianoml.coach_grant WHERE user_id = ?", userId);
    }
    for (UUID scoreId : createdScores) {
      jdbc.update("DELETE FROM pianoml.score WHERE id = ?", scoreId);
    }
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", userId);
    }
    jdbc.update("DELETE FROM pianoml.author WHERE id = ?", authorId);
  }

  // --- fixtures ---------------------------------------------------------------------------------------------------

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("pianist-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    createdUsers.add(saved.getId());
    return saved;
  }

  private String token(User user, List<String> scopes) {
    return grants.create(user, "Test host", scopes, 30).token();
  }

  private UUID newScore(UUID ownerId, String title, String tonic, String mode, float grade) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.score (id, title, author_id, owner_id, mbid, has_files, deleted, tonic, mode, grade, immutable_slug, duration)"
        + " VALUES (?, ?, ?, ?, ?, false, false, ?, ?, ?, ?, 0)",
      id, title, authorId, ownerId, UUID.randomUUID(), tonic, mode, grade, "slug-" + id);
    createdScores.add(id);
    return id;
  }

  private void putSession(UUID id, String body) throws Exception {
    mockMvc.perform(put("/practice/session/" + id)
        .header("Authorization", "Bearer " + jwtTokenProvider.generateToken(student))
        .contentType(MediaType.APPLICATION_JSON).content(body))
      .andExpect(status().isOk());
  }

  /** 8 measures; measure 2 is weak (15 hit, 10 wrong of 25) unless {@code perfect}. */
  private static String scoreSession(UUID scoreId, int minutesAgo, boolean perfect) {
    OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(minutesAgo).truncatedTo(ChronoUnit.SECONDS);
    int hit2 = perfect ? 25 : 15;
    int wrong2 = perfect ? 0 : 10;
    return """
      {
        "kind": "score", "scoreId": "%s", "startedAt": "%s", "endedAt": "%s", "timeZone": "Europe/Paris",
        "activeSeconds": 240, "takeCount": 2, "completedCount": 1,
        "measureStart": 1, "measureEnd": 4, "measureTotal": 8,
        "hands": "both", "tempoFactor": 0.8, "metronome": false, "loop": false, "input": "midi",
        "notesExpected": 100, "notesHit": %d, "notesWrong": %d, "onsets": 50, "waits": 5, "endReason": "stopped",
        "measures": [
          {"measure": 1, "notesExpected": 25, "notesHit": 25, "notesWrong": 0, "onsets": 12, "waits": 0},
          {"measure": 2, "notesExpected": 25, "notesHit": %d, "notesWrong": %d, "onsets": 13, "waits": 5},
          {"measure": 3, "notesExpected": 25, "notesHit": 25, "notesWrong": 0, "onsets": 12, "waits": 0},
          {"measure": 4, "notesExpected": 25, "notesHit": 25, "notesWrong": 0, "onsets": 13, "waits": 0}
        ],
        "takes": [
          {"startedAt": "%s", "activeSeconds": 60, "measureStart": 1, "measureEnd": 4, "hands": "right", "tempoFactor": 0.5,
           "completed": false, "notesExpected": 20, "notesHit": 10, "notesWrong": 10, "onsets": 10, "waits": 5},
          {"startedAt": "%s", "activeSeconds": 120, "measureStart": 1, "measureEnd": 4, "hands": "both", "tempoFactor": 0.8,
           "completed": true, "notesExpected": 80, "notesHit": 80, "notesWrong": 0, "onsets": 40, "waits": 0}
        ]
      }""".formatted(scoreId, start, start.plusMinutes(5), 90 + hit2 - 15, wrong2, hit2, wrong2, start, start.plusMinutes(2));
  }

  private static String exerciseSession(int minutesAgo) {
    OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(minutesAgo).truncatedTo(ChronoUnit.SECONDS);
    return """
      {
        "kind": "exercise", "exerciseType": "scale", "patternKey": "major", "exerciseKey": "intervals", "tonic": "C",
        "mode": "major", "title": "Intervals", "startedAt": "%s", "endedAt": "%s", "timeZone": "Europe/Paris",
        "activeSeconds": 120, "takeCount": 1, "completedCount": 1, "measureTotal": 4, "hands": "both", "input": "midi",
        "notesExpected": 40, "notesHit": 38, "notesWrong": 0, "onsets": 20, "waits": 1, "endReason": "ended",
        "measures": [
          {"measure": 1, "notesExpected": 10, "notesHit": 8, "notesWrong": 0, "onsets": 5, "waits": 1},
          {"measure": 2, "notesExpected": 30, "notesHit": 30, "notesWrong": 0, "onsets": 15, "waits": 0}
        ]
      }""".formatted(start, start.plusMinutes(3));
  }

  private JsonNode data(String tool, Map<String, Object> args) throws Exception {
    return mcp.data(token, tool, args);
  }

  private String errorCode(String tool, Map<String, Object> args) throws Exception {
    JsonNode envelope = mcp.call(token, tool, args);
    assertThat(envelope.path("ok").asBoolean()).as(tool + " " + args + " should fail").isFalse();
    assertThat(envelope.path("message").asText()).isNotBlank();
    return envelope.path("code").asText();
  }

  private static List<String> texts(JsonNode array, String field) {
    return StreamSupport.stream(array.spliterator(), false).map(n -> n.path(field).asText()).toList();
  }

  // --- contract ---------------------------------------------------------------------------------------------------

  private JsonNode contract() throws Exception {
    try (InputStream in = new ClassPathResource("coach/coach-tools.json").getInputStream()) {
      return json.readTree(in);
    }
  }

  @Test
  void toolsList_isExactlyTheRegisteredTools_withTheSchemasOfTheContractFile() throws Exception {
    JsonNode listed = mcp.listTools(token);
    assertThat(texts(listed, "name")).containsExactlyElementsOf(SERVER_TOOLS);

    Map<String, JsonNode> byName = new HashMap<>();
    contract().forEach(tool -> byName.put(tool.path("name").asText(), tool));
    for (JsonNode tool : listed) {
      JsonNode expected = byName.get(tool.path("name").asText());
      assertThat(tool.path("description").asText()).isEqualTo(expected.path("description").asText());
      assertThat(tool.path("inputSchema")).isEqualTo(expected.path("inputSchema"));
    }
  }

  @Test
  void contract_hasThirtyTools_noUserArgument_andNoVendorName() throws Exception {
    JsonNode tools = contract();
    assertThat(tools).hasSize(30);
    String instructions;
    try (InputStream in = new ClassPathResource("coach/instructions.md").getInputStream()) {
      instructions = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
    for (JsonNode tool : tools) {
      tool.path("inputSchema").path("properties").fieldNames().forEachRemaining(name ->
        assertThat(name.toLowerCase()).as(tool.path("name") + "." + name).doesNotContain("user").doesNotContain("owner"));
    }
    String text = (tools.toString() + instructions).toLowerCase();
    for (String vendor : List.of("claude", "anthropic", "openai", "chatgpt", "gpt-", "gemini", "google", "copilot",
      "cursor", "deepseek", "mistral", "llama", "ollama")) {
      assertThat(text).as(vendor).doesNotContain(vendor);
    }
  }

  // --- context ----------------------------------------------------------------------------------------------------

  @Test
  void getContext_describesTheStudentAndTheConnection() throws Exception {
    JsonNode context = data("get_context", Map.of());
    assertThat(context.path("user").path("name").asText()).isEqualTo(student.getName());
    assertThat(context.path("user").has("email")).isFalse();
    assertThat(context.path("grant").path("scopes").toString()).isEqualTo("[\"player:control\",\"practice:read\",\"scores:read\"]");
    assertThat(context.path("grant").path("expiresAt").asText()).isNotBlank();
    assertThat(context.path("timeZone").asText()).isEqualTo("Europe/Paris");
    assertThat(context.has("level")).isTrue();
    assertThat(context.path("player").path("connectedTabs").asInt()).isZero();
    assertThat(context.path("connectUrl").asText()).isEqualTo("https://pianoml.org/coach/connect");
    assertThat(context.toString()).doesNotContain(student.getEmail());
  }

  @Test
  void getContext_withoutPracticeOrPlayerScope_leavesTheirPartsOut_andPracticeToolsAreRefused() throws Exception {
    String libraryOnly = token(student, List.of("scores:read"));
    JsonNode context = mcp.data(libraryOnly, "get_context", Map.of());
    assertThat(context.has("level")).isFalse();
    assertThat(context.has("player")).isFalse();

    JsonNode refused = mcp.call(libraryOnly, "get_practice_summary", Map.of());
    assertThat(refused.path("code").asText()).isEqualTo("FORBIDDEN_SCOPE");
    assertThat(refused.path("message").asText()).contains("practice:read");
  }

  // --- practice tools ---------------------------------------------------------------------------------------------

  @Test
  void getPracticeSummary_givesTheOverview_andTheFiveMostRecentItems() throws Exception {
    JsonNode s = data("get_practice_summary", Map.of("timeZone", "Europe/Paris"));
    assertThat(s.path("timeZone").asText()).isEqualTo("Europe/Paris");
    assertThat(s.path("regularity").has("daily")).isFalse();
    assertThat(s.path("regularity").path("currentStreakDays").asInt()).isEqualTo(1);
    assertThat(s.path("volume").path("sessions").asInt()).isEqualTo(4);
    assertThat(s.path("itemsTotal").asInt()).isEqualTo(3);
    assertThat(texts(s.path("recentItems"), "title")).containsExactly("Intervals", "Etude", "Prelude");
    JsonNode preludeRow = s.path("recentItems").get(2);
    assertThat(preludeRow.path("url").asText()).isEqualTo("https://pianoml.org/score/slug-" + prelude);
    assertThat(preludeRow.path("practiceUrl").asText()).isEqualTo("https://pianoml.org/work/slug-" + prelude);
    assertThat(s.path("recentItems").get(0).has("url")).isFalse();
    assertThat(texts(s.path("keys"), "tonic")).contains("C", "G");

    assertThat(errorCode("get_practice_summary", Map.of("timeZone", "Mars/Olympus"))).isEqualTo("INVALID_ARGUMENT");
  }

  @Test
  void getPracticeCalendar_listsThePracticedDaysOfThePeriod() throws Exception {
    JsonNode c = data("get_practice_calendar", Map.of("days", 7));
    assertThat(c.path("currentStreakDays").asInt()).isEqualTo(1);
    assertThat(c.path("practicedDays").asInt()).isGreaterThanOrEqualTo(1);
    assertThat(c.path("totalActiveSeconds").asLong()).isEqualTo(4 * 0 + 240 * 3 + 120);
    assertThat(c.path("days").get(0).path("date").asText()).matches("\\d{4}-\\d{2}-\\d{2}");

    assertThat(errorCode("get_practice_calendar", Map.of("days", 3))).isEqualTo("INVALID_ARGUMENT");
    assertThat(errorCode("get_practice_calendar", Map.of("days", 7.5))).isEqualTo("INVALID_ARGUMENT");
  }

  @Test
  void listPracticedItems_sortsFiltersAndPages() throws Exception {
    JsonNode recent = data("list_practiced_items", Map.of());
    assertThat(texts(recent.path("items"), "title")).containsExactly("Intervals", "Etude", "Prelude");
    assertThat(recent.path("total").asInt()).isEqualTo(3);
    assertThat(recent.path("hasMore").asBoolean()).isFalse();

    assertThat(texts(data("list_practiced_items", Map.of("sort", "weakest")).path("items"), "title"))
      .containsExactly("Prelude", "Intervals", "Etude");
    assertThat(texts(data("list_practiced_items", Map.of("sort", "best")).path("items"), "title"))
      .containsExactly("Etude", "Intervals", "Prelude");
    assertThat(texts(data("list_practiced_items", Map.of("kind", "score")).path("items"), "title"))
      .containsExactly("Etude", "Prelude");
    assertThat(data("list_practiced_items", Map.of("sort", "stale")).path("items")).isEmpty();

    JsonNode page = data("list_practiced_items", Map.of("limit", 1, "offset", 1));
    assertThat(texts(page.path("items"), "title")).containsExactly("Etude");
    assertThat(page.path("hasMore").asBoolean()).isTrue();

    assertThat(errorCode("list_practiced_items", Map.of("sort", "alphabetical"))).isEqualTo("INVALID_ARGUMENT");
    assertThat(errorCode("list_practiced_items", Map.of("limit", 26))).isEqualTo("INVALID_ARGUMENT");
  }

  @Test
  void getItemProgress_forAScoreOrAnExercise() throws Exception {
    JsonNode score = data("get_item_progress", Map.of("slug", "slug-" + prelude));
    assertThat(score.path("item").path("title").asText()).isEqualTo("Prelude");
    assertThat(score.path("item").path("measureTotal").asInt()).isEqualTo(8);
    assertThat(texts(score.path("weakMeasures"), "measure")).containsExactly("2");
    assertThat(score.path("sessions")).hasSize(2);
    assertThat(data("get_item_progress", Map.of("scoreId", prelude.toString())).path("item").path("title").asText()).isEqualTo("Prelude");

    JsonNode exercise = data("get_item_progress",
      Map.of("exerciseType", "scale", "patternKey", "major", "exerciseKey", "intervals", "tonic", "C"));
    assertThat(exercise.path("item").path("kind").asText()).isEqualTo("exercise");
    assertThat(exercise.path("sessions")).hasSize(1);

    assertThat(errorCode("get_item_progress", Map.of())).isEqualTo("INVALID_ARGUMENT");
    assertThat(errorCode("get_item_progress", Map.of("slug", "slug-" + prelude, "tonic", "C"))).isEqualTo("INVALID_ARGUMENT");
    assertThat(errorCode("get_item_progress", Map.of("exerciseType", "scale", "tonic", "C"))).isEqualTo("INVALID_ARGUMENT");
    assertThat(errorCode("get_item_progress", Map.of("slug", "never-played"))).isEqualTo("ITEM_NOT_FOUND");
  }

  @Test
  void getWeakSpots_putsTheWeakestMeasureFirst_withARangeToLoop() throws Exception {
    JsonNode spots = data("get_weak_spots", Map.of()).path("spots");
    JsonNode first = spots.get(0);
    assertThat(first.path("item").path("title").asText()).isEqualTo("Prelude");
    assertThat(first.path("measure").asInt()).isEqualTo(2);
    assertThat(first.path("accuracy").asDouble()).isCloseTo(15.0 / 35.0, within(1e-9));
    assertThat(first.path("suggestedRange").path("fromMeasure").asInt()).isEqualTo(1);
    assertThat(first.path("suggestedRange").path("toMeasure").asInt()).isEqualTo(3);
    assertThat(first.path("item").path("practiceUrl").asText()).endsWith("/work/slug-" + prelude);

    assertThat(data("get_weak_spots", Map.of("kind", "exercise")).path("spots").get(0).path("item").path("kind").asText())
      .isEqualTo("exercise");
    assertThat(data("get_weak_spots", Map.of("limit", 1)).path("spots")).hasSize(1);
  }

  @Test
  void getKeyStats_listsTheKeysMostPracticedFirst() throws Exception {
    JsonNode keys = data("get_key_stats", Map.of()).path("keys");
    assertThat(texts(keys, "tonic")).contains("C", "G");
    assertThat(keys.get(0).path("activeSeconds").asLong()).isGreaterThanOrEqualTo(keys.get(1).path("activeSeconds").asLong());
  }

  @Test
  void getPracticeSessions_newestFirst_withoutMeasuresOrTakes() throws Exception {
    JsonNode sessions = data("get_practice_sessions", Map.of()).path("sessions");
    assertThat(sessions).hasSize(4);
    assertThat(sessions.get(0).path("kind").asText()).isEqualTo("exercise");
    assertThat(sessions.get(0).has("measures")).isFalse();
    assertThat(sessions.get(0).has("takes")).isFalse();
    assertThat(sessions.get(1).path("url").asText()).endsWith("/score/slug-" + etude);

    assertThat(data("get_practice_sessions", Map.of("limit", 2)).path("sessions")).hasSize(2);
    assertThat(data("get_practice_sessions", Map.of("kind", "exercise")).path("sessions")).hasSize(1);
    assertThat(data("get_practice_sessions", Map.of("scoreId", prelude.toString())).path("sessions")).hasSize(2);
    assertThat(data("get_practice_sessions", Map.of("sinceDays", 1)).path("sessions")).hasSize(4);
    assertThat(errorCode("get_practice_sessions", Map.of("scoreId", "not-a-uuid"))).isEqualTo("INVALID_ARGUMENT");
  }

  @Test
  void getPracticeSession_givesTakesAndMeasures_ofTheStudentsOwnSessionOnly() throws Exception {
    JsonNode s = data("get_practice_session", Map.of("sessionId", preludeSession.toString()));
    assertThat(s.path("id").asText()).isEqualTo(preludeSession.toString());
    assertThat(s.path("takes")).hasSize(2);
    assertThat(s.path("takes").get(0).path("accuracy").asDouble()).isCloseTo(10.0 / 30.0, within(1e-9)); // hit / (expected + wrong)
    assertThat(texts(s.path("measures"), "measure")).startsWith("2");
    assertThat(texts(data("get_practice_session", Map.of("sessionId", preludeSession.toString(), "measures", "all"))
      .path("measures"), "measure")).containsExactly("1", "2", "3", "4");
    assertThat(data("get_practice_session", Map.of("sessionId", preludeSession.toString(), "measures", "none"))
      .path("measures")).isEmpty();

    String otherToken = token(newUser(), ALL_SCOPES);
    JsonNode refused = mcp.call(otherToken, "get_practice_session", Map.of("sessionId", preludeSession.toString()));
    assertThat(refused.path("code").asText()).isEqualTo("SESSION_NOT_FOUND");
    assertThat(errorCode("get_practice_session", Map.of("sessionId", UUID.randomUUID().toString()))).isEqualTo("SESSION_NOT_FOUND");
    assertThat(errorCode("get_practice_session", Map.of())).isEqualTo("INVALID_ARGUMENT");
  }

  // --- isolation, arguments, limits, audit ------------------------------------------------------------------------

  @Test
  void anotherStudent_seesNoneOfThisHistory() throws Exception {
    String other = token(newUser(), ALL_SCOPES);
    assertThat(mcp.data(other, "get_practice_summary", Map.of()).path("itemsTotal").asInt()).isZero();
    assertThat(mcp.data(other, "list_practiced_items", Map.of()).path("total").asInt()).isZero();
    assertThat(mcp.data(other, "get_practice_sessions", Map.of()).path("sessions")).isEmpty();
    assertThat(mcp.data(other, "get_weak_spots", Map.of()).path("spots")).isEmpty();
    assertThat(mcp.data(other, "get_practice_sessions", Map.of("scoreId", prelude.toString())).path("sessions")).isEmpty();
  }

  @Test
  void unknownArgument_isRefused_evenOneNamingAUser() throws Exception {
    assertThat(errorCode("get_practice_sessions", Map.of("userId", UUID.randomUUID().toString()))).isEqualTo("INVALID_ARGUMENT");
  }

  @Test
  void callsAreRateLimitedPerGrant() throws Exception {
    String limited = token(student, List.of("practice:read"));
    int firstRefused = -1;
    for (int i = 1; i <= 125 && firstRefused < 0; i++) {
      JsonNode envelope = mcp.call(limited, "get_key_stats", Map.of());
      if ("RATE_LIMITED".equals(envelope.path("code").asText())) {
        firstRefused = i;
      }
    }
    // 60 calls per minute; the loop may cross one minute boundary
    assertThat(firstRefused).isBetween(61, 121);
    assertThat(mcp.call(token, "get_key_stats", Map.of()).path("ok").asBoolean()).as("other grants are not limited").isTrue();
  }

  @Test
  void aTokenRevokedBetweenTwoCalls_isRefusedOnTheSecond() throws Exception {
    String revocable = token(student, ALL_SCOPES);
    assertThat(mcp.data(revocable, "get_context", Map.of()).path("user").path("name").asText()).isEqualTo(student.getName());
    grants.revokeAll(student.getId());
    mcp.send(revocable, "tools/call", Map.of("name", "get_context", "arguments", Map.of())).andExpect(status().isUnauthorized());
  }

  @Test
  void everyCallIsAudited_withItsOutcome_andNoArgumentValue() throws Exception {
    String audited = token(student, List.of("practice:read"));
    mcp.call(audited, "get_key_stats", Map.of());
    mcp.call(audited, "get_practice_summary", Map.of("timeZone", "Mars/Olympus"));
    mcp.call(audited, "get_practice_session", Map.of("sessionId", preludeSession.toString()));

    UUID grantId = grants.list(student).stream().filter(g -> g.getScopes().equals("practice:read")).findFirst().orElseThrow().getId();
    List<Map<String, Object>> rows = jdbc.queryForList(
      "SELECT tool, outcome, user_id, duration_ms FROM pianoml.coach_audit WHERE grant_id = ? ORDER BY id", grantId);
    assertThat(rows).extracting(r -> r.get("tool") + ":" + r.get("outcome"))
      .containsExactly("get_key_stats:OK", "get_practice_summary:INVALID_ARGUMENT", "get_practice_session:OK");
    assertThat(rows).allSatisfy(r -> assertThat(r.get("user_id").toString()).isEqualTo(student.getId().toString()));

    List<String> columns = jdbc.queryForList(
      "SELECT LOWER(column_name) FROM information_schema.columns WHERE LOWER(table_name) = 'coach_audit'", String.class);
    assertThat(columns).containsExactlyInAnyOrder("id", "at", "user_id", "grant_id", "tool", "outcome", "duration_ms");
  }
}
