package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.model.AuthorWithScoreCount;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.model.ScoreGenreBrowseGet200ResponseInner;
import org.pianoml.backend.service.AuthorService;
import org.pianoml.backend.service.ScoreService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The library services as the coach tools use them (coach, issue #414): the same methods as the REST endpoints,
 * called for the grant's user, so the tools see exactly what the API shows that user.
 */
@Component
public class LibraryData {

  private final ScoreService scores;
  private final AuthorService authors;

  public LibraryData(ScoreService scores, AuthorService authors) {
    this.scores = scores;
    this.authors = authors;
  }

  /** The search of GET /score/search; grades as the API takes them (strings). */
  public List<ScoreApiInfo> search(User user, String keyword, String ownerId, String authorId, String authorSlug, String genreSlug,
                                   Boolean etude, Double gradeMin, Double gradeMax, String fullKey, String orderBy,
                                   int offset, int limit) {
    return scores.searchScores(keyword, ownerId, null, authorId, authorSlug, genreSlug, etude, grade(gradeMin), grade(gradeMax),
      null, fullKey, orderBy, offset, limit, user, null, null);
  }

  /** The score a slug (immutable) or an id designates; exactly one of them is given. */
  public ScoreApiInfo score(CoachArgs args) {
    boolean bySlug = args.has("slug");
    if (bySlug == args.has("scoreId")) {
      throw CoachToolException.invalidArgument("Give either slug or scoreId.");
    }
    Optional<ScoreApiInfo> score = bySlug ? scores.getScoreBySlug(args.string("slug")) : scores.getScore(args.uuid("scoreId"));
    return score.orElseThrow(() -> new CoachToolException("SCORE_NOT_FOUND",
      "No score with this " + (bySlug ? "slug" : "id") + ". Use search_scores to find one."));
  }

  /**
   * The id of the composer a name designates: an exact match (ignoring case) among the composers whose name
   * contains it, else the first of them. GET /score/search filters composers by id, not by name.
   */
  public Optional<String> composerIdByName(String name) {
    List<AuthorApiInfo> found = authors.searchAuthors(name);
    return found.stream().filter(a -> name.equalsIgnoreCase(a.getName())).findFirst()
      .or(() -> found.stream().findFirst())
      .map(AuthorApiInfo::getId);
  }

  public List<AuthorApiInfo> searchComposers(String query) {
    return authors.searchAuthors(query);
  }

  public List<AuthorWithScoreCount> composers(User user, int offset, int limit, String fullKey, String slug, Double gradeMin, Double gradeMax) {
    return scores.getAuthorsWithScoreCounts(user, offset, limit, null, fullKey, slug, grade(gradeMin), grade(gradeMax));
  }

  public List<ScoreGenreBrowseGet200ResponseInner> genres(User user, int offset, int limit, String fullKey, Double gradeMin, Double gradeMax) {
    return scores.getGenresWithScoreCounts(user, offset, limit, null, null, fullKey, null, grade(gradeMin), grade(gradeMax));
  }

  public List<String> keys() {
    return scores.getFullKeys();
  }

  static String userId(User user) {
    UUID id = user.getId();
    return id.toString();
  }

  private static String grade(Double value) {
    return value == null ? null : String.valueOf(value);
  }
}
