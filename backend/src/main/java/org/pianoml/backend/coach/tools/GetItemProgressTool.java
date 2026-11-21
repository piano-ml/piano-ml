package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.PracticeItemStats;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Predicate;

import static org.pianoml.backend.coach.tools.CoachRows.iso;

/** Tool 5, get_item_progress: one score (slug or scoreId) or one exercise (its four keys). */
@Component
public class GetItemProgressTool implements CoachToolHandler {

  private static final List<String> EXERCISE_KEYS = List.of("exerciseType", "patternKey", "exerciseKey", "tonic");

  private final CoachRows rows;
  private final PracticeData practice;

  public GetItemProgressTool(CoachRows rows, PracticeData practice) {
    this.rows = rows;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "get_item_progress";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    boolean score = args.has("slug") || args.has("scoreId");
    long exerciseKeys = EXERCISE_KEYS.stream().filter(args::has).count();
    if (score == (exerciseKeys > 0) || args.has("slug") && args.has("scoreId") || (!score && exerciseKeys < EXERCISE_KEYS.size())) {
      throw CoachToolException.invalidArgument(
        "Give either slug or scoreId for a score, or all of exerciseType, patternKey, exerciseKey and tonic for an exercise.");
    }
    User user = rows.user(principal);
    List<PracticeItemStats> items = practice.summary(user, null).getItems();
    Predicate<PracticeItemStats> match;
    if (score) {
      UUID scoreId = args.uuid("scoreId");
      String slug = args.string("slug");
      match = i -> "score".equals(i.getKind()) && (scoreId != null ? scoreId.equals(i.getScoreId()) : slug.equals(i.getSlug()));
    } else {
      match = i -> "exercise".equals(i.getKind())
        && Objects.equals(args.string("exerciseType"), i.getExerciseType())
        && Objects.equals(args.string("patternKey"), i.getPatternKey())
        && Objects.equals(args.string("exerciseKey"), i.getExerciseKey())
        && Objects.equals(args.string("tonic"), i.getTonic());
    }
    PracticeItemStats item = (items == null ? List.<PracticeItemStats>of() : items).stream().filter(match).findFirst()
      .orElseThrow(() -> new CoachToolException("ITEM_NOT_FOUND", "The student has not practiced this yet."));

    List<PracticeSession> sessions = score
      ? practice.recent(user, 5, null, item.getScoreId())
      : practice.recent(user, 100, PracticeSession.KIND_EXERCISE, null).stream()
        .filter(s -> Objects.equals(s.getExerciseType(), item.getExerciseType())
          && Objects.equals(s.getPatternKey(), item.getPatternKey())
          && Objects.equals(s.getExerciseKey(), item.getExerciseKey())
          && Objects.equals(s.getTonic(), item.getTonic()))
        .limit(5).toList();

    Map<String, Object> stats = rows.itemRow(item);
    stats.put("firstPlayedAt", iso(item.getFirstPlayedAt()));
    stats.put("playedHandsTogether", item.getPlayedHandsTogether());
    stats.put("measureTotal", item.getMeasureTotal());
    stats.put("measuresCovered", item.getMeasuresCovered());

    Map<String, Object> data = new LinkedHashMap<>();
    data.put("item", stats);
    data.put("weakMeasures", item.getWeakMeasures() == null ? List.of() : item.getWeakMeasures().stream().map(PracticeMaps::weakMeasure).toList());
    data.put("sessions", sessions.stream().map(practice::toApiInfo).map(rows::sessionRow).toList());
    return data;
  }
}
