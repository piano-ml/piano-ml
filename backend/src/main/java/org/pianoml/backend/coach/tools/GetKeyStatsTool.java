package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.model.PracticeKeyStats;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Tool 7, get_key_stats: time and accuracy per key, most practiced first, at most 30. */
@Component
public class GetKeyStatsTool implements CoachToolHandler {

  private final CoachRows rows;
  private final PracticeData practice;

  public GetKeyStatsTool(CoachRows rows, PracticeData practice) {
    this.rows = rows;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "get_key_stats";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    List<PracticeKeyStats> keys = practice.summary(rows.user(principal), null).getKeys();
    return Map.of("keys", (keys == null ? List.<PracticeKeyStats>of() : keys).stream()
      .sorted(Comparator.comparing((PracticeKeyStats k) -> k.getActiveSeconds() == null ? 0L : k.getActiveSeconds()).reversed())
      .limit(30).map(PracticeMaps::key).toList());
  }
}
