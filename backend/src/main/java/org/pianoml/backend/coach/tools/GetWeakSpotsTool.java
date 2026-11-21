package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.model.PracticeItemStats;
import org.pianoml.backend.model.PracticeWeakMeasure;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Tool 6, get_weak_spots: the weakest measures across all items, each with a range to loop. */
@Component
public class GetWeakSpotsTool implements CoachToolHandler {

  private final CoachRows rows;
  private final PracticeData practice;

  public GetWeakSpotsTool(CoachRows rows, PracticeData practice) {
    this.rows = rows;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "get_weak_spots";
  }

  private record Spot(PracticeItemStats item, PracticeWeakMeasure measure) {
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    String kind = args.string("kind");
    int limit = args.integer("limit", 10);
    List<PracticeItemStats> items = practice.summary(rows.user(principal), null).getItems();

    List<Map<String, Object>> spots = (items == null ? List.<PracticeItemStats>of() : items).stream()
      .filter(i -> kind == null || kind.equals(i.getKind()))
      .flatMap(i -> (i.getWeakMeasures() == null ? List.<PracticeWeakMeasure>of() : i.getWeakMeasures()).stream()
        .filter(w -> w.getMeasure() != null && w.getAccuracy() != null)
        .map(w -> new Spot(i, w)))
      .sorted(Comparator.comparing((Spot s) -> s.measure().getAccuracy())
        .thenComparing(s -> s.measure().getNotesExpected() == null ? 0 : s.measure().getNotesExpected(), Comparator.reverseOrder()))
      .limit(limit)
      .map(this::spot)
      .toList();
    return Map.of("spots", spots);
  }

  private Map<String, Object> spot(Spot s) {
    PracticeItemStats i = s.item();
    int measure = s.measure().getMeasure();
    Map<String, Object> item = new LinkedHashMap<>();
    item.put("kind", i.getKind());
    item.put("scoreId", i.getScoreId() == null ? null : i.getScoreId().toString());
    item.put("slug", i.getSlug());
    item.put("title", CoachRows.cut(i.getTitle(), CoachRows.TEXT_CAP));
    item.put("author", CoachRows.cut(i.getAuthor(), CoachRows.TEXT_CAP));
    item.put("exerciseType", i.getExerciseType());
    item.put("patternKey", i.getPatternKey());
    item.put("exerciseKey", i.getExerciseKey());
    item.put("tonic", i.getTonic());
    item.put("practiceUrl", "score".equals(i.getKind()) ? rows.practiceUrl(i.getSlug()) : null);

    Integer total = i.getMeasureTotal();
    Map<String, Object> range = new LinkedHashMap<>();
    range.put("fromMeasure", Math.max(1, measure - 1));
    range.put("toMeasure", total != null && total > 0 ? Math.min(total, measure + 1) : measure + 1);

    Map<String, Object> m = new LinkedHashMap<>();
    m.put("item", item);
    m.put("measure", measure);
    m.put("accuracy", s.measure().getAccuracy());
    m.put("notesExpected", s.measure().getNotesExpected());
    m.put("waits", s.measure().getWaits());
    m.put("suggestedRange", range);
    return m;
  }
}
