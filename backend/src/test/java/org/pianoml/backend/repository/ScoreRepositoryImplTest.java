package org.pianoml.backend.repository;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.GenreTree;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ScoreRepositoryImpl's hand-written queries (search criteria, browse by author / genre, stats) against a real
 * database: H2 in PostgreSQL mode with the Liquibase schema, each test in a rolled-back transaction.
 */
@SpringBootTest
@Transactional
class ScoreRepositoryImplTest {

  @Autowired private ScoreRepository scoreRepository;
  @Autowired private EntityManager em;

  private User alice;
  private User bob;
  private User admin;
  private Author satie;
  private Author bach;
  private Genre classical;
  private Genre baroque;
  private Genre jazz;
  private Genre pop;

  private static final OffsetDateTime DAY1 = OffsetDateTime.of(2026, 1, 1, 10, 0, 0, 0, ZoneOffset.UTC);
  private static final OffsetDateTime DAY2 = DAY1.plusDays(1);
  private static final OffsetDateTime DAY3 = DAY1.plusDays(2);

  private User user(String name, String roles) {
    User user = new User();
    user.setEmail(name + "-" + UUID.randomUUID() + "@example.com");
    user.setName(name);
    user.setPassword("x");
    user.setRoles(roles);
    em.persist(user);
    return user;
  }

  private Author author(String name, String sortName, String slug) {
    Author author = new Author();
    author.setMbid(UUID.randomUUID());
    author.setName(name);
    author.setSortName(sortName);
    author.setSlug(slug);
    em.persist(author);
    return author;
  }

  private Genre genre(String name) {
    Genre genre = new Genre();
    genre.setMbid(UUID.randomUUID());
    genre.setName(name + "-" + UUID.randomUUID().toString().substring(0, 6));
    genre.setSlug("test-" + name);
    em.persist(genre);
    return genre;
  }

  private GenreTree tree(Genre genre, GenreTree parent) {
    GenreTree node = new GenreTree();
    node.setId(genre.getId());
    node.setParent(parent);
    em.persist(node);
    return node;
  }

  private Score score(String title, Author author, Genre genre, User owner, Float grade, Integer tracks, String fullKey,
                      boolean hasFiles, long playCount, OffsetDateTime uploadedAt) {
    Score score = new Score();
    score.setTitle(title);
    score.setAuthor(author);
    score.setGenre(genre);
    score.setOwner(owner);
    score.setMbid(UUID.randomUUID());
    score.setVersion(1);
    score.setGrade(grade);
    score.setTracksCount(tracks);
    score.setFullKey(fullKey);
    score.setHasFiles(hasFiles);
    score.setPlayCount(playCount);
    score.setUploadedAt(uploadedAt);
    score.setImmutableSlug("test-" + title.toLowerCase().replace(' ', '-'));
    em.persist(score);
    return score;
  }

  /**
   * Fixture:
   * <pre>
   * title                author genre      owner grade tracks key       files plays uploaded  other
   * Gymnopedie No 1      Satie  classical  alice 2.0   2      D major   yes   50    day1      tempo 72, described
   * Gnossienne No 1      Satie  -          bob   -     1      -         yes   10    day2
   * Prelude in C         Bach   baroque    bob   3.5   2      C major   yes   30    day3      etude
   * Draft                Bach   jazz       alice 1.0   2      C major   NO    0     -         failed import
   * Fugue in G           Bach   pop        alice 5.0   3      G major   yes   20    day2      deleted
   * genre tree: classical > baroque; jazz (root); pop not in the tree
   * </pre>
   */
  @BeforeEach
  void fixture() {
    alice = user("alice", "USER");
    bob = user("bob", "USER");
    admin = user("admin", "USER,ADMIN");
    satie = author("Erik Satie", "Satie, Erik", "test-satie");
    bach = author("Johann Sebastian Bach", "Bach, Johann Sebastian", "test-bach");
    classical = genre("classical");
    baroque = genre("baroque");
    jazz = genre("jazz");
    pop = genre("pop");
    GenreTree classicalNode = tree(classical, null);
    tree(baroque, classicalNode);
    tree(jazz, null);

    Score gymno = score("Gymnopedie No 1", satie, classical, alice, 2.0f, 2, "D major", true, 50, DAY1);
    gymno.setTempo(72);
    gymno.setDescription("Slow and painful");
    score("Gnossienne No 1", satie, null, bob, null, 1, null, true, 10, DAY2);
    score("Prelude in C", bach, baroque, bob, 3.5f, 2, "C major", true, 30, DAY3).setEtude(true);
    score("Draft", bach, jazz, alice, 1.0f, 2, "C major", false, 0, null);
    score("Fugue in G", bach, pop, alice, 5.0f, 3, "G major", true, 20, DAY2).setDeleted(true);
    em.flush();
  }

  // --- helpers ---------------------------------------------------------------------------------------------

  /** Titles found by findWithSomeCriterias, restricted to this test's scores, in result order. */
  private List<String> search(Criteria c) {
    return scoreRepository.findWithSomeCriterias(c.keyword, c.ownerId, c.genreId, c.artist, c.artistSlug, c.genreSlug, c.etude,
        c.gradeStart, c.gradeEnd, c.tempo, c.fullKey, c.orderBy, c.offset, c.limit, c.user, c.tracks, c.description)
      .stream().map(Score::getTitle).filter(TITLES::contains).toList();
  }

  private static final List<String> TITLES = List.of("Gymnopedie No 1", "Gnossienne No 1", "Prelude in C", "Draft", "Fugue in G", "Pop song");

  private static class Criteria {
    String keyword, ownerId, genreId, artist, artistSlug, genreSlug, gradeStart, gradeEnd, tempo, fullKey, orderBy, description;
    Boolean etude;
    Integer offset, limit;
    User user;
    List<Integer> tracks;
  }

  private Criteria criteria(java.util.function.Consumer<Criteria> setup) {
    Criteria c = new Criteria();
    setup.accept(c);
    return c;
  }

  // =========================================================================================================
  @Nested
  class Search {
    @Test
    void listsOnlyScoresWithFiles_mostPlayedFirst_forVisitors() {
      assertThat(search(criteria(c -> { }))).containsExactly("Gymnopedie No 1", "Prelude in C", "Fugue in G", "Gnossienne No 1");
    }

    @Test
    void listsAllTheOwnersScores_includingFailedImports() {
      assertThat(search(criteria(c -> c.ownerId = alice.getId().toString())))
        .containsExactlyInAnyOrder("Gymnopedie No 1", "Draft", "Fugue in G");
    }

    @Test
    void matchesTheKeywordInTitleOrAuthor_ignoringCase() {
      assertThat(search(criteria(c -> c.keyword = "GNOSS"))).containsExactly("Gnossienne No 1");
      assertThat(search(criteria(c -> c.keyword = "satie"))).containsExactlyInAnyOrder("Gymnopedie No 1", "Gnossienne No 1");
    }

    @Test
    void aGenreIncludesItsDirectSubgenres() {
      assertThat(search(criteria(c -> c.genreId = classical.getId().toString()))).containsExactlyInAnyOrder("Gymnopedie No 1", "Prelude in C");
      assertThat(search(criteria(c -> c.genreId = baroque.getId().toString()))).containsExactly("Prelude in C");
      assertThat(search(criteria(c -> c.genreSlug = "test-classical"))).containsExactlyInAnyOrder("Gymnopedie No 1", "Prelude in C");
      assertThat(search(criteria(c -> c.genreSlug = "test-pop"))).containsExactly("Fugue in G");
    }

    @Test
    void genreNoneFindsScoresWithoutGenre() {
      assertThat(search(criteria(c -> c.genreId = "NONE"))).containsExactly("Gnossienne No 1");
    }

    @Test
    void filtersByArtistIdOrSlug() {
      assertThat(search(criteria(c -> c.artist = satie.getId().toString())))
        .containsExactly("Gymnopedie No 1", "Gnossienne No 1"); // by artist: title descending
      assertThat(search(criteria(c -> c.artistSlug = "test-bach"))).containsExactlyInAnyOrder("Prelude in C", "Fugue in G");
    }

    @Test
    void filtersEtudes() {
      assertThat(search(criteria(c -> c.etude = true))).containsExactly("Prelude in C");
    }

    @Test
    void filtersByGradeRange_lowestGradeFirst() {
      assertThat(search(criteria(c -> { c.gradeStart = "2"; c.gradeEnd = "4"; }))).containsExactly("Gymnopedie No 1", "Prelude in C");
      assertThat(search(criteria(c -> c.gradeStart = "3"))).containsExactlyInAnyOrder("Prelude in C", "Fugue in G");
      // the upper bound is inclusive, alone or with a lower bound, as in the browse queries: 3.5 is above 3
      assertThat(search(criteria(c -> c.gradeEnd = "3"))).containsExactly("Gymnopedie No 1");
      assertThat(search(criteria(c -> c.gradeEnd = "3.5"))).containsExactlyInAnyOrder("Gymnopedie No 1", "Prelude in C");
      assertThat(search(criteria(c -> { c.gradeStart = "0"; c.gradeEnd = "3"; }))).containsExactly("Gymnopedie No 1");
      assertThat(search(criteria(c -> { c.gradeStart = "NONE"; c.gradeEnd = "NONE"; }))).containsExactly("Gnossienne No 1");
      assertThat(search(criteria(c -> c.gradeStart = "not-a-number"))).hasSize(4); // ignored
    }

    @Test
    void filtersByKeyTracksTempoAndDescription() {
      assertThat(search(criteria(c -> c.fullKey = "C major"))).containsExactly("Prelude in C");
      assertThat(search(criteria(c -> c.fullKey = "NONE"))).containsExactly("Gnossienne No 1");
      assertThat(search(criteria(c -> c.tracks = List.of(1, 3)))).containsExactlyInAnyOrder("Gnossienne No 1", "Fugue in G");
      assertThat(search(criteria(c -> c.tempo = "NONE"))).doesNotContain("Gymnopedie No 1").hasSize(3);
      assertThat(search(criteria(c -> c.description = "NONE"))).doesNotContain("Gymnopedie No 1").hasSize(3);
    }

    @Test
    void sortsAsRequested() {
      assertThat(search(criteria(c -> c.orderBy = "title_asc"))).containsExactly("Fugue in G", "Gnossienne No 1", "Gymnopedie No 1", "Prelude in C");
      assertThat(search(criteria(c -> c.orderBy = "title_desc"))).containsExactly("Prelude in C", "Gymnopedie No 1", "Gnossienne No 1", "Fugue in G");
      assertThat(search(criteria(c -> { c.orderBy = "grade_desc"; c.gradeStart = "0"; }))).containsExactly("Fugue in G", "Prelude in C", "Gymnopedie No 1");
      assertThat(search(criteria(c -> { c.orderBy = "grade_asc"; c.gradeStart = "0"; }))).containsExactly("Gymnopedie No 1", "Prelude in C", "Fugue in G");
      assertThat(search(criteria(c -> c.orderBy = "uploadedAt_asc"))).first().isEqualTo("Gymnopedie No 1");
      assertThat(search(criteria(c -> c.orderBy = "uploadedAt_desc"))).first().isEqualTo("Prelude in C");
      assertThat(search(criteria(c -> c.orderBy = "playCount_asc"))).containsExactly("Gnossienne No 1", "Fugue in G", "Prelude in C", "Gymnopedie No 1");
      assertThat(search(criteria(c -> c.orderBy = "playCount_desc"))).containsExactly("Gymnopedie No 1", "Prelude in C", "Fugue in G", "Gnossienne No 1");
      assertThat(search(criteria(c -> c.orderBy = "nonsense"))).first().isEqualTo("Gymnopedie No 1"); // falls back to most played
    }

    @Test
    void aLoggedInUserSeesLeastPlayedFirst_thenNewest() {
      assertThat(search(criteria(c -> c.user = alice))).containsExactly("Gnossienne No 1", "Fugue in G", "Prelude in C", "Gymnopedie No 1");
    }

    @Test
    void paginates() {
      assertThat(search(criteria(c -> { c.keyword = "satie"; c.orderBy = "title_asc"; c.offset = 1; c.limit = 1; })))
        .containsExactly("Gymnopedie No 1");
    }
  }

  // =========================================================================================================
  @Nested
  class BrowseByAuthor {
    /** sortName -> count, for this test's authors. */
    private Map<String, Long> counts(User user, List<Integer> tracks, String fullKey, String slug, String gradeStart, String gradeEnd) {
      return scoreRepository.countScoresGroupedByAuthor(user, null, null, tracks, fullKey, slug, gradeStart, gradeEnd).stream()
        .filter(row -> List.of(satie.getId(), bach.getId()).contains(((Author) row[0]).getId()))
        .collect(Collectors.toMap(row -> ((Author) row[0]).getSortName(), row -> (Long) row[1], (a, b) -> a, java.util.LinkedHashMap::new));
    }

    @Test
    void countsEachAuthorsScores_sortedByName_excludingDeletedOnes() {
      // NOTE: unlike the search and the genre browse, scores without files (the failed "Draft") are counted
      assertThat(counts(null, null, null, null, null, null)).containsExactly(
        Map.entry("Bach, Johann Sebastian", 2L), Map.entry("Satie, Erik", 2L));
    }

    @Test
    void returnsTheLatestUploadOfEachAuthor() {
      Object[] satieRow = scoreRepository.countScoresGroupedByAuthor(null, null, null, null, null, "test-satie", null, null).get(0);
      assertThat(((OffsetDateTime) satieRow[2]).toInstant()).isEqualTo(DAY2.toInstant());
    }

    @Test
    void worksForLoggedInUsersAndAdmins() {
      assertThat(counts(alice, null, null, null, null, null)).hasSize(2);
      assertThat(counts(admin, null, null, null, null, null)).hasSize(2);
    }

    @Test
    void filtersByTracksKeySlugAndGrade() {
      assertThat(counts(null, List.of(1), null, null, null, null)).containsExactly(Map.entry("Satie, Erik", 1L));
      assertThat(counts(null, null, "C major", null, null, null)).containsExactly(Map.entry("Bach, Johann Sebastian", 2L));
      assertThat(counts(null, null, "NONE", null, null, null)).containsExactly(Map.entry("Satie, Erik", 1L));
      assertThat(counts(null, null, null, "test-bach", null, null)).containsOnlyKeys("Bach, Johann Sebastian");
      assertThat(counts(null, null, null, null, "2", "3")).containsExactly(Map.entry("Satie, Erik", 1L));
      assertThat(counts(null, null, null, null, "NONE", "NONE")).containsExactly(Map.entry("Satie, Erik", 1L));
    }

    @Test
    void paginates() {
      List<Object[]> all = scoreRepository.countScoresGroupedByAuthor(null, null, null, null, null, null, null, null);
      List<Object[]> second = scoreRepository.countScoresGroupedByAuthor(null, 1, 1, null, null, null, null, null);
      assertThat(second).hasSize(1);
      assertThat(((Author) second.get(0)[0]).getId()).isEqualTo(((Author) all.get(1)[0]).getId());
    }
  }

  // =========================================================================================================
  @Nested
  class BrowseByGenre {
    @BeforeEach
    void aLivePopScore() { // Fugue in G (pop) is deleted
      score("Pop song", satie, pop, bob, 4.0f, 3, null, true, 5, DAY1);
      em.flush();
    }

    /** genre name prefix (or "none") -> count, for this test's genres plus scores without genre. */
    private Map<String, Long> counts(List<Integer> tracks, List<UUID> genres, String fullKey, String slug, String gradeStart, String gradeEnd) {
      List<UUID> mine = List.of(classical.getId(), baroque.getId(), jazz.getId(), pop.getId());
      return scoreRepository.countScoresGroupedByGenre(null, null, null, tracks, genres, fullKey, slug, gradeStart, gradeEnd).stream()
        .filter(row -> row[0] == null || mine.contains(((Genre) row[0]).getId()))
        .collect(Collectors.toMap(row -> row[0] == null ? "none" : ((Genre) row[0]).getName().split("-")[0], row -> (Long) row[1]));
    }

    @Test
    void groupsSubgenresUnderTheirRoot_countingOnlyPlayableScores() {
      Map<String, Long> counts = counts(null, null, null, null, null, null);
      assertThat(counts).containsEntry("classical", 2L); // Gymnopedie + Prelude (baroque, a subgenre)
      assertThat(counts).containsEntry("pop", 1L) // pop is not in the genre tree: its own group; the deleted Fugue is not counted
        .doesNotContainKey("baroque")
        .doesNotContainKey("jazz"); // only Draft, which has no files
      assertThat(counts.get("none")).isGreaterThanOrEqualTo(1L); // Gnossienne
    }

    @Test
    void filtersByRootGenreSlugTracksKeyAndGrade() {
      assertThat(counts(null, List.of(classical.getId()), null, null, null, null)).containsOnly(Map.entry("classical", 2L));
      assertThat(counts(null, null, null, "test-classical", null, null)).containsOnly(Map.entry("classical", 2L));
      assertThat(counts(List.of(3), null, null, null, null, null)).containsOnly(Map.entry("pop", 1L));
      assertThat(counts(null, null, "D major", null, null, null)).containsOnly(Map.entry("classical", 1L));
      assertThat(counts(null, null, "NONE", null, null, null)).containsOnly(Map.entry("none", 1L), Map.entry("pop", 1L));
      assertThat(counts(null, null, null, null, "3", "5")).containsOnly(Map.entry("classical", 1L), Map.entry("pop", 1L));
      assertThat(counts(null, null, null, null, "NONE", "NONE")).containsOnlyKeys("none");
    }

    @Test
    void returnsTheLatestUploadOfEachGroup() {
      Object[] classicalRow = scoreRepository.countScoresGroupedByGenre(null, null, null, null, List.of(classical.getId()), null, null, null, null).get(0);
      assertThat(((OffsetDateTime) classicalRow[2]).toInstant()).isEqualTo(DAY3.toInstant());
    }

    @Test
    void paginatesInMemory() {
      List<Object[]> all = scoreRepository.countScoresGroupedByGenre(null, null, null, null, null, null, null, null, null);
      assertThat(scoreRepository.countScoresGroupedByGenre(null, 1, 2, null, null, null, null, null, null)).hasSize(Math.min(2, all.size() - 1));
      assertThat(scoreRepository.countScoresGroupedByGenre(null, all.size() + 5, 2, null, null, null, null, null, null)).isEmpty();
    }
  }

  // =========================================================================================================
  @Nested
  class Stats {
    @Test
    void countsPublicDomainAndCopyrightedScores_excludingDeletedOnes() {
      Long[] before = scoreRepository.countPublicAndCopyrighted();
      Score copyrighted = score("Modern piece", bach, null, bob, 1f, 2, null, true, 0, DAY1);
      copyrighted.setPublicDomain(false);
      Score deleted = score("Gone", bach, null, bob, 1f, 2, null, true, 0, DAY1);
      deleted.setDeleted(true);
      em.flush();

      Long[] after = scoreRepository.countPublicAndCopyrighted();
      assertThat(after[0] - before[0]).isZero();
      assertThat(after[1] - before[1]).isEqualTo(1);
    }

    @Test
    void listsTheDistinctKeysInUse_sorted() {
      List<String> keys = scoreRepository.findDistinctFullKeys();
      assertThat(keys).contains("C major", "D major", "G major").doesNotContainNull();
      assertThat(keys).isSorted();
      assertThat(keys.stream().filter("C major"::equals).count()).isEqualTo(1);
    }
  }

  @Test
  void otherDerivedQueriesWork() {
    assertThat(scoreRepository.countScoreByMbidAndOwner(UUID.randomUUID(), alice)).isZero();
    assertThat(scoreRepository.findByImmutableSlugStartingWith("test-gymnopedie")).extracting(Score::getTitle).containsExactly("Gymnopedie No 1");
    assertThat(scoreRepository.findByImmutableSlug("test-prelude-in-c")).map(Score::getTitle).contains("Prelude in C");
  }
}
