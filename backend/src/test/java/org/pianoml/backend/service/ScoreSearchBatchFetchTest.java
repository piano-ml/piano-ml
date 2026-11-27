package org.pianoml.backend.service;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.config.LibraryCache;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A list of scores loads their genres, authors and owners in batches (hibernate.default_batch_fetch_size), not one
 * select each: a library list of 100 scores made 200+ round trips to the database.
 */
@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class ScoreSearchBatchFetchTest {

  private static final int SCORES = 6;

  @Autowired private ScoreService scoreService;
  @Autowired private UserRepository userRepository;
  @Autowired private EntityManagerFactory emf;
  @Autowired private LibraryCache libraryCache;
  @Autowired private JdbcTemplate jdbc;

  private final List<UUID> scores = new ArrayList<>();
  private final List<UUID> authors = new ArrayList<>();
  private final List<UUID> genres = new ArrayList<>();
  private final List<UUID> users = new ArrayList<>();

  @AfterEach
  void cleanUp() {
    scores.forEach(id -> jdbc.update("DELETE FROM pianoml.score WHERE id = ?", id));
    authors.forEach(id -> jdbc.update("DELETE FROM pianoml.author WHERE id = ?", id));
    genres.forEach(id -> jdbc.update("DELETE FROM pianoml.genre WHERE id = ?", id));
    users.forEach(id -> jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", id));
    libraryCache.clear();
  }

  @Test
  void aListOfScoresLoadsTheirGenresAuthorsAndOwnersInOneSelectEach() {
    String keyword = "batchfetch" + UUID.randomUUID().toString().substring(0, 8);
    for (int i = 0; i < SCORES; i++) {
      // A different genre, author and owner per score: without batches, one select for each of them
      UUID genre = UUID.randomUUID();
      jdbc.update("INSERT INTO pianoml.genre (id, name, slug) VALUES (?, ?, ?)", genre, keyword + "-g" + i, keyword + "-g" + i);
      genres.add(genre);
      UUID author = UUID.randomUUID();
      jdbc.update("INSERT INTO pianoml.author (id, name) VALUES (?, ?)", author, keyword + "-a" + i);
      authors.add(author);
      UUID score = UUID.randomUUID();
      jdbc.update("INSERT INTO pianoml.score (id, title, author_id, owner_id, genre_id, mbid, has_files, deleted, immutable_slug, duration, image)"
          + " VALUES (?, ?, ?, ?, ?, ?, true, false, ?, 0, ?)",
        score, keyword + " " + i, author, newUser().getId(), genre, UUID.randomUUID(), "slug-" + score, "https://img.example/" + score + ".png");
      scores.add(score);
    }
    libraryCache.clear();
    Statistics statistics = emf.unwrap(SessionFactory.class).getStatistics();
    statistics.clear();

    List<ScoreApiInfo> found = scoreService.searchScores(keyword, null, null, null, null, null, null, null, null, null, null, null, 0, 100, null, null, null);

    assertThat(found).hasSize(SCORES);
    assertThat(found).allSatisfy(score -> assertThat(score.getAuthor()).startsWith(keyword));
    // The search, then one select for the genres, one for the authors, one for the owners (was 1 + 3 x 6)
    assertThat(statistics.getPrepareStatementCount()).isLessThanOrEqualTo(4);
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("batch-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    users.add(saved.getId());
    return saved;
  }
}
