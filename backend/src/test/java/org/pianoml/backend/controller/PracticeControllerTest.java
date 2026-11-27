package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.PracticeSessionRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Practice sessions end to end (issue #399), on the schema built by Liquibase (changelog 022): idempotent
 * upsert, ownership, plausibility checks, cascades, and the progress summary on a seeded history.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PracticeControllerTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private PracticeSessionRepository practiceSessionRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;

  private UUID authorId;
  private final List<UUID> createdScores = new ArrayList<>();
  private final List<UUID> createdUsers = new ArrayList<>();

  @BeforeEach
  void author() {
    authorId = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.author (id, name) VALUES (?, ?)", authorId, "Composer " + authorId);
  }

  @AfterEach
  void cleanup() {
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.practice_session WHERE user_id = ?", userId);
    }
    for (UUID scoreId : createdScores) {
      jdbc.update("DELETE FROM pianoml.user_play_count WHERE score_id = ?", scoreId);
      jdbc.update("DELETE FROM pianoml.score WHERE id = ?", scoreId);
    }
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", userId);
    }
    jdbc.update("DELETE FROM pianoml.author WHERE id = ?", authorId);
  }

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

  private UUID newScore(UUID ownerId, String title, String tonic, String mode, float grade) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.score (id, title, author_id, owner_id, mbid, has_files, deleted, tonic, mode, grade, immutable_slug, duration)"
        + " VALUES (?, ?, ?, ?, ?, false, false, ?, ?, ?, ?, 0)",
      id, title, authorId, ownerId, UUID.randomUUID(), tonic, mode, grade, "slug-" + id);
    createdScores.add(id);
    return id;
  }

  private String bearer(User user) {
    return "Bearer " + jwtTokenProvider.generateToken(user);
  }

  private int count(String sql, Object... args) {
    return jdbc.queryForObject(sql, Integer.class, args);
  }

  /** A 5-minute session on a score, started {@code minutesAgo} minutes ago: 100 notes expected, 90 hit, 10 wrong. */
  private static String scoreSession(UUID scoreId, int minutesAgo, int activeSeconds) {
    OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(minutesAgo).truncatedTo(ChronoUnit.SECONDS);
    return """
      {
        "kind": "score", "scoreId": "%s", "title": "ignored: read from the score",
        "startedAt": "%s", "endedAt": "%s", "timeZone": "Europe/Paris",
        "activeSeconds": %d, "takeCount": 2, "completedCount": 1,
        "measureStart": 1, "measureEnd": 4, "measureTotal": 8,
        "hands": "both", "tempoFactor": 0.8, "metronome": false, "loop": false, "input": "midi",
        "notesExpected": 100, "notesHit": 90, "notesWrong": 10, "onsets": 50, "waits": 5,
        "endReason": "stopped",
        "measures": [
          {"measure": 1, "notesExpected": 25, "notesHit": 25, "notesWrong": 0, "onsets": 12, "waits": 0},
          {"measure": 2, "notesExpected": 25, "notesHit": 15, "notesWrong": 10, "onsets": 13, "waits": 5},
          {"measure": 3, "notesExpected": 25, "notesHit": 25, "notesWrong": 0, "onsets": 12, "waits": 0},
          {"measure": 4, "notesExpected": 25, "notesHit": 25, "notesWrong": 0, "onsets": 13, "waits": 0}
        ],
        "takes": [
          {"startedAt": "%s", "activeSeconds": 60, "measureStart": 1, "measureEnd": 4, "hands": "right",
           "tempoFactor": 0.5, "completed": false, "notesExpected": 20, "notesHit": 10, "notesWrong": 10, "onsets": 10, "waits": 5},
          {"startedAt": "%s", "activeSeconds": 120, "measureStart": 1, "measureEnd": 4, "hands": "both",
           "tempoFactor": 0.8, "completed": true, "notesExpected": 80, "notesHit": 80, "notesWrong": 0, "onsets": 40, "waits": 0}
        ]
      }""".formatted(scoreId, start, start.plusMinutes(5), activeSeconds, start, start.plusMinutes(2));
  }

  private ResultActions putSession(User user, UUID id, String body) throws Exception {
    return mockMvc.perform(put("/practice/session/" + id)
      .header("Authorization", bearer(user)).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  // --- migration -------------------------------------------------------------------------------------------

  @Test
  void sessions_goAwayWithTheirUser_andSurviveTheirScore() throws Exception {
    User user = newUser();
    User owner = newUser();
    UUID score = newScore(owner.getId(), "Prelude", "C", "major", 3f);
    UUID session = UUID.randomUUID();
    putSession(user, session, scoreSession(score, 10, 200)).andExpect(status().isOk());

    jdbc.update("DELETE FROM pianoml.score WHERE id = ?", score);
    assertThat(count("SELECT COUNT(*) FROM pianoml.practice_session WHERE id = ? AND score_id IS NULL AND title = 'Prelude'",
      session)).isEqualTo(1);

    mockMvc.perform(post("/account/delete").header("Authorization", bearer(user))).andExpect(status().isNoContent());
    assertThat(count("SELECT COUNT(*) FROM pianoml.practice_session WHERE id = ?", session)).isZero();
  }

  // --- write -----------------------------------------------------------------------------------------------

  @Test
  void put_storesTheSession_withScoreSnapshotAndComputedRatios() throws Exception {
    User user = newUser();
    UUID score = newScore(user.getId(), "Prelude", "C", "major", 3f);
    UUID id = UUID.randomUUID();

    putSession(user, id, scoreSession(score, 10, 200))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.id").value(id.toString()))
      .andExpect(jsonPath("$.title").value("Prelude"))
      .andExpect(jsonPath("$.slug").value("slug-" + score))
      .andExpect(jsonPath("$.tonic").value("C"))
      .andExpect(jsonPath("$.grade").value(3.0))
      .andExpect(jsonPath("$.accuracy", closeTo(90.0 / 110.0, 1e-9)))
      .andExpect(jsonPath("$.flow", closeTo(85.0 / 110, 1e-9)))
      .andExpect(jsonPath("$.measures", hasSize(4)))
      .andExpect(jsonPath("$.takes", hasSize(2)));

    PracticeSession stored = practiceSessionRepository.findById(id).orElseThrow();
    assertThat(stored.getUserId()).isEqualTo(user.getId());
    assertThat(stored.getAuthor()).startsWith("Composer ");
    assertThat(stored.getTimeZone()).isEqualTo("Europe/Paris");
    assertThat(stored.getLocalDate()).isBetween(LocalDate.now(ZoneOffset.UTC).minusDays(1), LocalDate.now(ZoneOffset.UTC).plusDays(1));
  }

  @Test
  void put_twice_updatesTheSameRow() throws Exception {
    User user = newUser();
    UUID score = newScore(user.getId(), "Prelude", "C", "major", 3f);
    UUID id = UUID.randomUUID();

    putSession(user, id, scoreSession(score, 10, 100)).andExpect(status().isOk());
    putSession(user, id, scoreSession(score, 10, 250)).andExpect(status().isOk());

    assertThat(count("SELECT COUNT(*) FROM pianoml.practice_session WHERE user_id = ?", user.getId())).isEqualTo(1);
    assertThat(practiceSessionRepository.findById(id).orElseThrow().getActiveSeconds()).isEqualTo(250);
  }

  @Test
  void put_storesAnExercise_byItsStableKeys() throws Exception {
    User user = newUser();
    UUID id = UUID.randomUUID();
    OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(3).truncatedTo(ChronoUnit.SECONDS);

    putSession(user, id, """
      {"kind": "exercise", "exerciseType": "scale", "patternKey": "harmonic_minor", "exerciseKey": "left_than_right",
       "tonic": "Am", "mode": "Harmonic minor", "title": "Left then right",
       "startedAt": "%s", "endedAt": "%s", "activeSeconds": 90, "takeCount": 1, "completedCount": 1,
       "hands": "both", "input": "midi", "notesExpected": 30, "notesHit": 30, "notesWrong": 0, "onsets": 30, "waits": 0}
      """.formatted(start, start.plusMinutes(2)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.kind").value("exercise"))
      .andExpect(jsonPath("$.accuracy").value(1.0));

    mockMvc.perform(get("/practice/sessions?kind=exercise").header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$", hasSize(1)))
      .andExpect(jsonPath("$[0].patternKey").value("harmonic_minor"))
      .andExpect(jsonPath("$[0].exerciseKey").value("left_than_right"));
  }

  @Test
  void put_withoutAccuracyNorFlow_isNotStored_untilAssessed() throws Exception {
    User user = newUser();
    UUID score = newScore(user.getId(), "Prelude", "C", "major", 3f);
    UUID id = UUID.randomUUID();
    String listening = scoreSession(score, 10, 100)
      .replace("\"notesExpected\": 100, \"notesHit\": 90, \"notesWrong\": 10, \"onsets\": 50, \"waits\": 5,",
        "\"notesExpected\": 0, \"notesHit\": 0, \"notesWrong\": 0, \"onsets\": 0, \"waits\": 0,");

    putSession(user, id, listening).andExpect(status().isNoContent());
    assertThat(practiceSessionRepository.findById(id)).isEmpty();

    // The same session, once notes were assessed (a later checkpoint), is stored
    putSession(user, id, scoreSession(score, 10, 100)).andExpect(status().isOk());
    assertThat(practiceSessionRepository.findById(id)).isPresent();
  }

  @Test
  void put_onAnotherUsersSession_isForbidden() throws Exception {
    User user = newUser();
    User intruder = newUser();
    UUID score = newScore(user.getId(), "Prelude", "C", "major", 3f);
    UUID id = UUID.randomUUID();
    putSession(user, id, scoreSession(score, 10, 100)).andExpect(status().isOk());

    putSession(intruder, id, scoreSession(score, 10, 999)).andExpect(status().isForbidden());

    PracticeSession stored = practiceSessionRepository.findById(id).orElseThrow();
    assertThat(stored.getUserId()).isEqualTo(user.getId());
    assertThat(stored.getActiveSeconds()).isEqualTo(100);
  }

  @Test
  void put_rejectsImplausibleSessions() throws Exception {
    User user = newUser();
    UUID score = newScore(user.getId(), "Prelude", "C", "major", 3f);
    String valid = scoreSession(score, 10, 100);

    // more active time than the session lasted (5 minutes)
    putSession(user, UUID.randomUUID(), scoreSession(score, 10, 400)).andExpect(status().isBadRequest());
    // more notes hit than expected
    putSession(user, UUID.randomUUID(), valid.replace("\"notesHit\": 90,", "\"notesHit\": 101,")).andExpect(status().isBadRequest());
    // more notes late than notes hit
    putSession(user, UUID.randomUUID(), valid.replace("\"onsets\": 50, \"waits\": 5,", "\"onsets\": 50, \"waits\": 91,")).andExpect(status().isBadRequest());
    // older than a week
    putSession(user, UUID.randomUUID(), scoreSession(score, 8 * 24 * 60, 100)).andExpect(status().isBadRequest());
    // in the future
    putSession(user, UUID.randomUUID(), scoreSession(score, -60, 100)).andExpect(status().isBadRequest());
    // unknown score
    putSession(user, UUID.randomUUID(), scoreSession(UUID.randomUUID(), 10, 100)).andExpect(status().isBadRequest());
    // exercise without its keys
    putSession(user, UUID.randomUUID(), valid.replace("\"kind\": \"score\"", "\"kind\": \"exercise\"")).andExpect(status().isBadRequest());

    assertThat(count("SELECT COUNT(*) FROM pianoml.practice_session WHERE user_id = ?", user.getId())).isZero();
  }

  // --- read ------------------------------------------------------------------------------------------------

  @Test
  void anonymousUsers_getNothing() throws Exception {
    mockMvc.perform(get("/practice/sessions")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/practice/summary")).andExpect(status().isUnauthorized());
  }

  @Test
  void sessions_areListedNewestFirst_andOnlyToTheirOwner() throws Exception {
    User user = newUser();
    User other = newUser();
    UUID score = newScore(user.getId(), "Prelude", "C", "major", 3f);
    UUID older = UUID.randomUUID();
    UUID newer = UUID.randomUUID();
    putSession(user, older, scoreSession(score, 120, 100)).andExpect(status().isOk());
    putSession(user, newer, scoreSession(score, 10, 100)).andExpect(status().isOk());
    putSession(other, UUID.randomUUID(), scoreSession(score, 10, 100)).andExpect(status().isOk());

    mockMvc.perform(get("/practice/sessions").header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[*].id", contains(newer.toString(), older.toString())));
    mockMvc.perform(get("/practice/sessions?limit=1&scoreId=" + score).header("Authorization", bearer(user)))
      .andExpect(jsonPath("$[*].id", contains(newer.toString())));
  }

  @Test
  void deleteHistory_removesOnlyTheUsersSessions() throws Exception {
    User user = newUser();
    User other = newUser();
    UUID score = newScore(user.getId(), "Prelude", "C", "major", 3f);
    putSession(user, UUID.randomUUID(), scoreSession(score, 10, 100)).andExpect(status().isOk());
    putSession(other, UUID.randomUUID(), scoreSession(score, 10, 100)).andExpect(status().isOk());

    mockMvc.perform(delete("/practice/sessions").header("Authorization", bearer(user))).andExpect(status().isNoContent());

    assertThat(count("SELECT COUNT(*) FROM pianoml.practice_session WHERE user_id = ?", user.getId())).isZero();
    assertThat(count("SELECT COUNT(*) FROM pianoml.practice_session WHERE user_id = ?", other.getId())).isEqualTo(1);
  }

  // --- summary ---------------------------------------------------------------------------------------------

  /** Plants a session directly, as old as needed (the endpoint refuses sessions older than a week). */
  private void seed(User user, UUID scoreId, String title, LocalDate day, int activeSeconds, int expected, int hit, int wrong) {
    PracticeSession s = new PracticeSession();
    s.setId(UUID.randomUUID());
    s.setUserId(user.getId());
    s.setKind(PracticeSession.KIND_SCORE);
    s.setScoreId(scoreId);
    s.setTitle(title);
    s.setTonic("C");
    s.setMode("major");
    s.setGrade(3f);
    s.setStartedAt(day.atTime(12, 0).atOffset(ZoneOffset.UTC));
    s.setEndedAt(day.atTime(12, 30).atOffset(ZoneOffset.UTC));
    s.setLocalDate(day);
    s.setTimeZone("UTC");
    s.setActiveSeconds(activeSeconds);
    s.setTakeCount(1);
    s.setHands("both");
    s.setMeasureTotal(8);
    s.setNotesExpected(expected);
    s.setNotesHit(hit);
    s.setNotesWrong(wrong);
    s.setOnsets(expected);
    s.setAccuracy(expected == 0 ? null : (double) hit / (expected + wrong));
    s.setFlow(expected == 0 ? null : 1.0);
    practiceSessionRepository.save(s);
  }

  @Test
  void summary_ofAnEmptyHistory_isAllZeros() throws Exception {
    User user = newUser();

    mockMvc.perform(get("/practice/summary").header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.regularity.currentStreakDays").value(0))
      .andExpect(jsonPath("$.volume.sessions").value(0))
      .andExpect(jsonPath("$.scoreAccuracy.last10.sessions").value(0))
      .andExpect(jsonPath("$.items", hasSize(0)));
  }

  @Test
  void sessionsStoredWithoutAccuracyNorFlow_countNowhere() throws Exception {
    User user = newUser();
    UUID prelude = newScore(user.getId(), "Prelude", "C", "major", 3f);
    LocalDate today = LocalDate.now(ZoneOffset.UTC);
    // Listening sessions stored before they were refused: nothing expected, so neither accuracy nor flow
    seed(user, prelude, "Prelude", today.minusDays(1), 600, 0, 0, 0);
    seed(user, prelude, "Prelude", today.minusDays(2), 600, 0, 0, 0);
    seed(user, prelude, "Prelude", today.minusDays(3), 300, 100, 80, 0);

    mockMvc.perform(get("/practice/sessions").header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$", hasSize(1)));
    mockMvc.perform(get("/practice/summary?timeZone=UTC").header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.volume.sessions").value(1))
      .andExpect(jsonPath("$.volume.activeSeconds").value(300))
      .andExpect(jsonPath("$.items[0].sessions").value(1));
  }

  @Test
  void summary_reportsStreakVolumeTrendKeysItemsAndLevel() throws Exception {
    User user = newUser();
    UUID prelude = newScore(user.getId(), "Prelude", "C", "major", 3f);
    LocalDate today = LocalDate.now(ZoneOffset.UTC);
    // Practiced today, yesterday and the day before; then a gap; then a 4-day run three weeks ago.
    for (int daysAgo : new int[]{1, 2}) {
      seed(user, prelude, "Prelude", today.minusDays(daysAgo), 600, 100, 80, 0);
    }
    for (int daysAgo : new int[]{20, 21, 22, 23}) {
      seed(user, null, "Old piece", today.minusDays(daysAgo), 300, 100, 50, 0);
    }
    // 30 seconds do not make a practice day
    seed(user, null, "Old piece", today.minusDays(10), 30, 10, 5, 0);
    // today, through the endpoint: per-measure counters and takes
    putSession(user, UUID.randomUUID(), scoreSession(prelude, 10, 200)).andExpect(status().isOk());

    mockMvc.perform(get("/practice/summary?timeZone=UTC").header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.timeZone").value("UTC"))
      .andExpect(jsonPath("$.regularity.longestStreakDays").value(4))
      .andExpect(jsonPath("$.regularity.practiceDays30").value(7))
      .andExpect(jsonPath("$.volume.sessions").value(8))
      .andExpect(jsonPath("$.volume.activeSeconds").value(600 * 2 + 300 * 4 + 30 + 200))
      .andExpect(jsonPath("$.volume.scores").value(2))
      .andExpect(jsonPath("$.volume.exercises").value(0))
      .andExpect(jsonPath("$.scoreAccuracy.last10.sessions").value(8))
      .andExpect(jsonPath("$.exerciseAccuracy.last10.sessions").value(0))
      .andExpect(jsonPath("$.keys", hasSize(1)))
      .andExpect(jsonPath("$.keys[0].tonic").value("C"))
      .andExpect(jsonPath("$.keys[0].sessions").value(8))
      // most recently played first
      .andExpect(jsonPath("$.items[0].title").value("Prelude"))
      .andExpect(jsonPath("$.items[0].slug").value("slug-" + prelude))
      .andExpect(jsonPath("$.items[0].sessions").value(3))
      .andExpect(jsonPath("$.items[0].bestAccuracy", closeTo(90.0 / 110.0, 1e-9)))
      .andExpect(jsonPath("$.items[0].bestTempoFactor").value(0.8))
      .andExpect(jsonPath("$.items[0].playedHandsTogether").value(true))
      .andExpect(jsonPath("$.items[0].measuresCovered").value(4))
      .andExpect(jsonPath("$.items[0].coverage").value(0.5))
      .andExpect(jsonPath("$.items[0].weakMeasures[*].measure", contains(2)))
      .andExpect(jsonPath("$.items[0].stale").value(false))
      .andExpect(jsonPath("$.items[1].title").value("Old piece"))
      .andExpect(jsonPath("$.items[1].stale").value(false)) // played 10 days ago
      .andExpect(jsonPath("$.level.grades[0].grade").value(3))
      .andExpect(jsonPath("$.level.grades[0].scores").value(2))
      .andExpect(jsonPath("$.level.highestGradeMastered").value(3.0));
  }
}
