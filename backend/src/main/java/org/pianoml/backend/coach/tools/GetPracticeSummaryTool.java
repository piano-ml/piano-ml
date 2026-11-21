package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.model.PracticeItemStats;
import org.pianoml.backend.model.PracticeKeyStats;
import org.pianoml.backend.model.PracticeSummary;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Tool 2, get_practice_summary. */
@Component
public class GetPracticeSummaryTool implements CoachToolHandler {

  private final CoachRows rows;
  private final PracticeData practice;

  public GetPracticeSummaryTool(CoachRows rows, PracticeData practice) {
    this.rows = rows;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "get_practice_summary";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    String timeZone = new CoachArgs(arguments).timeZone("timeZone");
    PracticeSummary s = practice.summary(rows.user(principal), timeZone);
    List<PracticeItemStats> items = s.getItems() == null ? List.of() : s.getItems();
    List<PracticeKeyStats> keys = s.getKeys() == null ? List.of() : s.getKeys();

    Map<String, Object> data = new LinkedHashMap<>();
    data.put("timeZone", s.getTimeZone());
    data.put("regularity", PracticeMaps.regularity(s.getRegularity()));
    data.put("volume", PracticeMaps.volume(s.getVolume()));
    data.put("scoreAccuracy", PracticeMaps.trend(s.getScoreAccuracy()));
    data.put("exerciseAccuracy", PracticeMaps.trend(s.getExerciseAccuracy()));
    data.put("level", PracticeMaps.level(s.getLevel()));
    data.put("keys", keys.stream()
      .sorted(Comparator.comparing((PracticeKeyStats k) -> k.getActiveSeconds() == null ? 0L : k.getActiveSeconds()).reversed())
      .limit(5).map(PracticeMaps::key).toList());
    // Items come most recently played first
    data.put("recentItems", items.stream().limit(5).map(rows::itemRow).toList());
    data.put("itemsTotal", items.size());
    return data;
  }
}
