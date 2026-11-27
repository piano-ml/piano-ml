package org.pianoml.backend.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

/**
 * Read caches of the library (/library pages): the queries behind them are the slowest of the API (a search took
 * seconds), and the server-side rendering of every library page waits on them.
 * <p>
 * In-process (Caffeine), so each instance has its own: a write clears the caches of the instance that made it
 * ({@link LibraryCache#clear()}), the others catch up when their entries expire. Hence the short lifetimes on the
 * lists, which also bound how late play counts ("popular") and new scores show. User-dependent lists (they include
 * the user's own private scores) are cached for anonymous visitors only: {@code condition = "#user == null"}.
 */
@Configuration
@EnableCaching
public class LibraryCacheConfig {

  /** Score counts of the library. */
  public static final String STATS = "library.stats";
  /** The keys of the key filter. */
  public static final String FULL_KEYS = "library.fullKeys";
  /** All genres with their score counts. */
  public static final String GENRES = "library.genres";
  /** Genre tiles of the library (anonymous). */
  public static final String GENRE_BROWSE = "library.genreBrowse";
  /** Artist tiles of the library (anonymous). */
  public static final String AUTHOR_BROWSE = "library.authorBrowse";
  /** Score lists of the library (anonymous). */
  public static final String SEARCH = "library.search";

  private record Spec(String name, Duration lifetime, long maxEntries) {
  }

  /** One line per cache: how long an entry lives, and how many entries an instance keeps at most. */
  static final List<Spec> SPECS = List.of(
    new Spec(STATS, Duration.ofMinutes(10), 1),
    new Spec(FULL_KEYS, Duration.ofMinutes(10), 1),
    new Spec(GENRES, Duration.ofMinutes(10), 1),
    new Spec(GENRE_BROWSE, Duration.ofMinutes(2), 2_000),
    new Spec(AUTHOR_BROWSE, Duration.ofMinutes(2), 2_000),
    // Any combination of filters is a key: bounded, and short-lived for the new scores and play counts
    new Spec(SEARCH, Duration.ofSeconds(60), 5_000)
  );

  static List<String> names() {
    return SPECS.stream().map(Spec::name).toList();
  }

  @Bean
  public CacheManager cacheManager() {
    SimpleCacheManager manager = new SimpleCacheManager();
    manager.setCaches(SPECS.stream()
      .map(spec -> new CaffeineCache(spec.name(), Caffeine.newBuilder()
        .expireAfterWrite(spec.lifetime())
        .maximumSize(spec.maxEntries())
        .recordStats()
        .build()))
      .toList());
    return manager;
  }
}
