package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Tool 20, recommend_scores: popular scores around the student's level that they have not practiced. Level L is
 * the highest grade mastered, 1 when unknown; easier [L-1, L], same [L, L+1], harder [L+1, L+2], within 0..8.
 */
@Component
public class RecommendScoresTool implements CoachToolHandler {

  static final int CANDIDATES = 50;

  private final CoachRows rows;
  private final LibraryData library;
  private final PracticeData practice;

  public RecommendScoresTool(CoachRows rows, LibraryData library, PracticeData practice) {
    this.rows = rows;
    this.library = library;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "recommend_scores";
  }

  static double[] range(double level, String difficulty) {
    double low = switch (difficulty) {
      case "easier" -> level - 1;
      case "harder" -> level + 1;
      default -> level;
    };
    return new double[] {Math.max(0, Math.min(8, low)), Math.max(0, Math.min(8, low + 1))};
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int count = args.integer("count", 5);
    String difficulty = args.has("difficulty") ? args.string("difficulty") : "same";
    User user = rows.user(principal);
    PracticeSummary summary = practice.summary(user, null);
    Float mastered = summary.getLevel() == null ? null : summary.getLevel().getHighestGradeMastered();
    double level = mastered == null ? 1 : mastered;
    double[] grades = range(level, difficulty);

    Set<String> practiced = new HashSet<>();
    if (summary.getItems() != null) {
      summary.getItems().stream().map(PracticeItemStats::getScoreId).filter(Objects::nonNull).forEach(id -> practiced.add(id.toString()));
    }
    List<ScoreApiInfo> candidates = library.search(user, null, null, null, null, args.string("genreSlug"), null,
      grades[0], grades[1], args.string("key"), "playCount_desc", 0, CANDIDATES);

    Map<String, Object> basis = new LinkedHashMap<>();
    basis.put("level", mastered);
    basis.put("gradeMin", grades[0]);
    basis.put("gradeMax", grades[1]);
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("basis", basis);
    data.put("scores", candidates.stream().filter(s -> !practiced.contains(s.getId())).limit(count).map(rows::scoreRow).toList());
    return data;
  }
}
