package org.pianoml.backend.repository;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The genre filter of the library search: the genre and its direct sub-genres (genre_tree), by slug or by id. */
@SpringBootTest
class ScoreSearchGenreFilterTest {

  @Autowired private ScoreRepository scoreRepository;
  @Autowired private UserRepository userRepository;
  @Autowired private JdbcTemplate jdbc;

  private final String prefix = "genrefilter" + UUID.randomUUID().toString().substring(0, 8);
  private UUID parent;
  private UUID owner;

  @BeforeEach
  void genres() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName(prefix);
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    owner = userRepository.save(user).getId();

    parent = genre("parent");
    UUID child = genre("child");
    UUID other = genre("other");
    jdbc.update("INSERT INTO pianoml.genre_tree (genre_id, parent_id) VALUES (?, NULL)", parent);
    jdbc.update("INSERT INTO pianoml.genre_tree (genre_id, parent_id) VALUES (?, ?)", child, parent);
    score("in-parent", parent);
    score("in-child", child);
    score("in-other", other);
  }

  @AfterEach
  void cleanUp() {
    String like = prefix + "%";
    jdbc.update("DELETE FROM pianoml.score WHERE title LIKE ?", like);
    jdbc.update("DELETE FROM pianoml.author WHERE name LIKE ?", like);
    jdbc.update("DELETE FROM pianoml.genre_tree WHERE genre_id IN (SELECT id FROM pianoml.genre WHERE slug LIKE ?) AND parent_id IS NOT NULL", like);
    jdbc.update("DELETE FROM pianoml.genre_tree WHERE genre_id IN (SELECT id FROM pianoml.genre WHERE slug LIKE ?)", like);
    jdbc.update("DELETE FROM pianoml.genre WHERE slug LIKE ?", like);
    jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", owner);
  }

  private UUID genre(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.genre (id, name, slug) VALUES (?, ?, ?)", id, prefix + "-" + name, prefix + "-" + name);
    return id;
  }

  private void score(String title, UUID genre) {
    UUID author = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.author (id, name) VALUES (?, ?)", author, prefix + "-" + title);
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.score (id, title, author_id, owner_id, genre_id, mbid, has_files, deleted, immutable_slug, duration, image)"
        + " VALUES (?, ?, ?, ?, ?, ?, true, false, ?, 0, ?)",
      id, prefix + " " + title, author, owner, genre, UUID.randomUUID(), "slug-" + id, "https://img.example/" + id + ".png");
  }

  private List<String> titles(String genreId, String genreSlug) {
    return scoreRepository.findWithSomeCriterias(prefix, null, genreId, null, null, genreSlug, null, null, null, null, null, "title_asc", 0, 100, null, null, null)
      .stream().map(Score::getTitle).map(title -> title.substring(prefix.length() + 1)).toList();
  }

  @Test
  void aGenreSlugMatchesTheGenreAndItsSubGenres() {
    assertThat(titles(null, prefix + "-parent")).containsExactly("in-child", "in-parent");
    assertThat(titles(null, prefix + "-child")).containsExactly("in-child");
  }

  @Test
  void aGenreIdMatchesTheGenreAndItsSubGenres() {
    assertThat(titles(parent.toString(), null)).containsExactly("in-child", "in-parent");
  }

  @Test
  void anUnknownGenreMatchesNothing() {
    assertThat(titles(null, prefix + "-missing")).isEmpty();
    assertThat(titles(UUID.randomUUID().toString(), null)).isEmpty();
  }
}
