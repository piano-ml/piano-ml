package org.pianoml.backend.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.GenreApiInfo;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.service.GenreService;
import org.pianoml.backend.service.ScoreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The library caches: anonymous reads are cached, a logged-in user's are not, and a write clears them. */
@SpringBootTest
class LibraryCacheTest {

  @Autowired private ScoreService scoreService;
  @Autowired private GenreService genreService;
  @Autowired private CacheManager cacheManager;
  @Autowired private LibraryCache libraryCache;
  @Autowired private UserRepository userRepository;
  @Autowired private JdbcTemplate jdbc;

  private final List<UUID> createdUsers = new ArrayList<>();
  private final List<String> createdGenres = new ArrayList<>();

  @BeforeEach
  void emptyCaches() {
    libraryCache.clear();
  }

  @AfterEach
  void cleanUp() {
    createdGenres.forEach(slug -> jdbc.update("DELETE FROM pianoml.genre WHERE slug = ?", slug));
    createdUsers.forEach(id -> jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", id));
    libraryCache.clear();
  }

  private long entries(String name) {
    Cache cache = cacheManager.getCache(name);
    assertThat(cache).isNotNull();
    return ((com.github.benmanes.caffeine.cache.Cache<?, ?>) cache.getNativeCache()).estimatedSize();
  }

  private List<?> search(User user) {
    return scoreService.searchScores(null, null, null, null, null, "cache-test-genre", null, null, null, null, null, null, 0, 10, user, null, null);
  }

  @Test
  void anAnonymousSearchIsCachedAndALoggedInOneIsNot() {
    search(null);
    search(null);
    assertThat(entries(LibraryCacheConfig.SEARCH)).isEqualTo(1);

    search(newUser());
    assertThat(entries(LibraryCacheConfig.SEARCH)).isEqualTo(1);
  }

  @Test
  void aWriteClearsTheCaches() {
    List<GenreApiInfo> before = genreService.getAllGenres();
    search(null);
    assertThat(entries(LibraryCacheConfig.GENRES)).isEqualTo(1);

    String slug = "cache-test-" + UUID.randomUUID();
    createdGenres.add(slug);
    GenreApiInfo genre = new GenreApiInfo();
    genre.setName(slug);
    genre.setSlug(slug);
    genreService.createGenre(genre);

    assertThat(entries(LibraryCacheConfig.GENRES)).isZero();
    assertThat(entries(LibraryCacheConfig.SEARCH)).isZero();
    assertThat(genreService.getAllGenres()).hasSizeGreaterThanOrEqualTo(before.size());
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("cache-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    createdUsers.add(saved.getId());
    return saved;
  }
}
