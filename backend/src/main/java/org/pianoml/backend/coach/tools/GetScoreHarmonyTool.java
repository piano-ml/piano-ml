package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 12, get_score_harmony: chord symbols per measure over at most 64 measures. */
@Component
public class GetScoreHarmonyTool implements CoachToolHandler {

  static final int MAX_SPAN = 64;
  private static final Map<String, String> SUFFIXES = Map.of(
    "major", "", "minor", "m", "dominant-seventh", "7", "major-seventh", "maj7",
    "minor-seventh", "m7", "diminished", "dim", "augmented", "aug");

  private final LibraryData library;

  public GetScoreHarmonyTool(LibraryData library) {
    this.library = library;
  }

  @Override
  public String name() {
    return "get_score_harmony";
  }

  /** root + a short suffix for the kind (" " + kind when unknown) + "/" + bass. */
  static String symbol(String root, String kind, String bass) {
    String suffix = kind == null ? "" : SUFFIXES.getOrDefault(kind, " " + kind);
    return root + suffix + (bass == null || bass.isBlank() ? "" : "/" + bass);
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int from = args.integer("fromMeasure", 1);
    int to = args.integer("toMeasure", from + 15);
    if (to < from) {
      throw CoachToolException.invalidArgument("toMeasure must not be before fromMeasure.");
    }
    if (to - from + 1 > MAX_SPAN) {
      throw CoachToolException.invalidArgument("At most " + MAX_SPAN + " measures at a time.");
    }
    ScoreApiInfo score = library.score(args);
    List<HarmonyEntry> harmony = CoachRows.present(score.getHarmony());
    List<Map<String, Object>> chords = (harmony == null ? List.<HarmonyEntry>of() : harmony).stream()
      .filter(h -> h.getMeasure() != null && h.getMeasure() >= from && h.getMeasure() <= to)
      .sorted(Comparator.comparing(HarmonyEntry::getMeasure).thenComparing(h -> h.getBeat() == null ? 0f : h.getBeat()))
      .map(h -> {
        String bass = CoachRows.present(h.getBass());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("measure", h.getMeasure());
        m.put("beat", h.getBeat());
        m.put("symbol", symbol(h.getRoot(), h.getKind(), bass));
        m.put("root", h.getRoot());
        m.put("kind", h.getKind());
        m.put("bass", bass);
        return m;
      }).toList();
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("hasHarmony", harmony != null && !harmony.isEmpty());
    data.put("fromMeasure", from);
    data.put("toMeasure", to);
    data.put("chords", chords);
    return data;
  }
}
