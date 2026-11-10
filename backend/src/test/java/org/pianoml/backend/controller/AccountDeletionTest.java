package org.pianoml.backend.controller;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.SystemUsers;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Account self-deletion end to end, on the schema built by Liquibase (changelog 021): junk user, score owner
 * foreign key (RESTRICT) and play-count cascade. Data is checked with plain JDBC, as the database sees it.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AccountDeletionTest {

  private static final String PASSWORD = "s3cret-pw";

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JdbcTemplate jdbc;

  @Autowired
  private UserRepository userRepository;

  @Autowired
  private PasswordEncoder passwordEncoder;

  @Autowired
  private JwtTokenProvider jwtTokenProvider;

  private UUID authorId;
  private final List<UUID> createdScores = new ArrayList<>();
  private final List<UUID> createdUsers = new ArrayList<>();

  @BeforeEach
  void author() {
    authorId = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.author (id, name) VALUES (?, ?)", authorId, "Test Author " + authorId);
  }

  @AfterEach
  void cleanup() {
    for (UUID scoreId : createdScores) {
      jdbc.update("DELETE FROM pianoml.user_play_count WHERE score_id = ?", scoreId);
      jdbc.update("DELETE FROM pianoml.score WHERE id = ?", scoreId);
    }
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.user_play_count WHERE user_id = ?", userId);
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", userId);
    }
    jdbc.update("DELETE FROM pianoml.author WHERE id = ?", authorId);
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("to-delete-" + UUID.randomUUID()); // user.name is unique
    user.setPassword(passwordEncoder.encode(PASSWORD));
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    createdUsers.add(saved.getId());
    return saved;
  }

  private UUID newScore(UUID ownerId, boolean deleted) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.score (id, title, author_id, owner_id, mbid, has_files, deleted) VALUES (?, ?, ?, ?, ?, false, ?)",
      id, "Score " + id, authorId, ownerId, UUID.randomUUID(), deleted);
    createdScores.add(id);
    return id;
  }

  private void playCount(UUID userId, UUID scoreId) {
    jdbc.update("INSERT INTO pianoml.user_play_count (user_id, score_id, count, updated_on) VALUES (?, ?, 3, CURRENT_DATE)",
      userId, scoreId);
  }

  private UUID ownerOf(UUID scoreId) {
    return jdbc.queryForObject("SELECT owner_id FROM pianoml.score WHERE id = ?", UUID.class, scoreId);
  }

  private int count(String sql, Object... args) {
    return jdbc.queryForObject(sql, Integer.class, args);
  }

  private String bearer(User user) {
    return "Bearer " + jwtTokenProvider.generateToken(user);
  }

  private static String body(String password) {
    return "{\"password\":\"" + password + "\"}";
  }

  // --- migration -------------------------------------------------------------------------------------------

  @Test
  void junkUserExists_andCannotLogIn() throws Exception {
    assertThat(count("SELECT COUNT(*) FROM pianoml.\"user\" WHERE id = ? AND name = 'junk' AND roles = 'SYSTEM'",
      SystemUsers.JUNK_ID)).isEqualTo(1);

    // The stored "password" is not a BCrypt hash: no input can match it.
    mockMvc.perform(post("/account/login").contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"junk@pianoml.invalid\",\"password\":\"!no-login\"}"))
      .andExpect(status().isForbidden());
  }

  @Test
  void orphanReassignmentChangeset_givesOrphanScoresToJunk() throws Exception {
    // Plant an orphan as it may exist in production (owner_id had no foreign key before changelog 021).
    UUID orphan = UUID.randomUUID();
    jdbc.execute("SET REFERENTIAL_INTEGRITY FALSE");
    try {
      newScore(UUID.randomUUID(), false);
      jdbc.update("UPDATE pianoml.score SET id = ? WHERE id = ?", orphan, createdScores.removeLast());
      createdScores.add(orphan);
    } finally {
      jdbc.execute("SET REFERENTIAL_INTEGRITY TRUE");
    }

    jdbc.execute(changesetSql("021-2-reassign-orphan-scores-to-junk"));

    assertThat(ownerOf(orphan)).isEqualTo(SystemUsers.JUNK_ID);
  }

  @Test
  void database_refusesToDeleteAUserWhoStillOwnsScores() {
    User user = newUser();
    newScore(user.getId(), false);

    assertThatThrownBy(() -> jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", user.getId()))
      .isInstanceOf(DataIntegrityViolationException.class);
  }

  // --- endpoint --------------------------------------------------------------------------------------------

  @Test
  void delete_movesAllScoresToJunk_deletesUserAndPlayCounts_andExpiresCookie() throws Exception {
    User user = newUser();
    User other = newUser();
    UUID published = newScore(user.getId(), false);
    UUID softDeleted = newScore(user.getId(), true);
    UUID othersScore = newScore(other.getId(), false);
    playCount(user.getId(), published);
    playCount(user.getId(), othersScore);
    playCount(other.getId(), published);

    MvcResult result = mockMvc.perform(post("/account/delete")
        .header("Authorization", bearer(user))
        .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
      .andExpect(status().isNoContent())
      .andReturn();

    // Scores kept, owned by junk; other users' scores untouched.
    assertThat(ownerOf(published)).isEqualTo(SystemUsers.JUNK_ID);
    assertThat(ownerOf(softDeleted)).isEqualTo(SystemUsers.JUNK_ID);
    assertThat(ownerOf(othersScore)).isEqualTo(other.getId());

    // User gone; its play counts removed by ON DELETE CASCADE; other users' play counts kept.
    assertThat(count("SELECT COUNT(*) FROM pianoml.\"user\" WHERE id = ?", user.getId())).isZero();
    assertThat(count("SELECT COUNT(*) FROM pianoml.user_play_count WHERE user_id = ?", user.getId())).isZero();
    assertThat(count("SELECT COUNT(*) FROM pianoml.user_play_count WHERE user_id = ? AND score_id = ?",
      other.getId(), published)).isEqualTo(1);

    assertThat(result.getResponse().getHeaders("Set-Cookie"))
      .anyMatch(h -> h.startsWith("Authorization=;") && h.contains("Max-Age=0") && !h.contains("Domain="));
  }

  @Test
  void delete_withWrongPassword_is403_andChangesNothing() throws Exception {
    User user = newUser();
    UUID score = newScore(user.getId(), false);

    mockMvc.perform(post("/account/delete")
        .header("Authorization", bearer(user))
        .contentType(MediaType.APPLICATION_JSON).content(body("wrong")))
      .andExpect(status().isForbidden());

    assertThat(ownerOf(score)).isEqualTo(user.getId());
    assertThat(count("SELECT COUNT(*) FROM pianoml.\"user\" WHERE id = ?", user.getId())).isEqualTo(1);
  }

  @Test
  void delete_withoutPassword_is400() throws Exception {
    User user = newUser();
    mockMvc.perform(post("/account/delete")
        .header("Authorization", bearer(user))
        .contentType(MediaType.APPLICATION_JSON).content("{}"))
      .andExpect(status().isBadRequest());
    assertThat(count("SELECT COUNT(*) FROM pianoml.\"user\" WHERE id = ?", user.getId())).isEqualTo(1);
  }

  @Test
  void delete_withoutAuthentication_is401() throws Exception {
    mockMvc.perform(post("/account/delete")
        .header("Authorization", "Bearer not-a-jwt")
        .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
      .andExpect(status().isUnauthorized());
  }

  @Test
  void delete_withCookieAuthButNoCsrfToken_isRejected() throws Exception {
    User user = newUser();
    mockMvc.perform(post("/account/delete")
        .cookie(new Cookie("Authorization", jwtTokenProvider.generateToken(user)))
        .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
      .andExpect(status().isForbidden())
      .andExpect(jsonPath("$.error").value("CSRF_TOKEN_INVALID"));
    assertThat(count("SELECT COUNT(*) FROM pianoml.\"user\" WHERE id = ?", user.getId())).isEqualTo(1);
  }

  /** Reads a changeset's SQL from changelog 021, so the test runs exactly what production will run. */
  @SuppressWarnings("unchecked")
  private static String changesetSql(String changesetId) throws Exception {
    try (InputStream in = new ClassPathResource("db/changelog/changes/021-junk-user-and-user-delete-cascade.yaml").getInputStream()) {
      Map<String, Object> root = new Yaml().load(in);
      for (Map<String, Object> entry : (List<Map<String, Object>>) root.get("databaseChangeLog")) {
        Map<String, Object> changeSet = (Map<String, Object>) entry.get("changeSet");
        if (changesetId.equals(changeSet.get("id"))) {
          Map<String, Object> change = ((List<Map<String, Object>>) changeSet.get("changes")).getFirst();
          return (String) ((Map<String, Object>) change.get("sql")).get("sql");
        }
      }
    }
    throw new IllegalArgumentException("No changeset " + changesetId);
  }
}
