package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.model.PracticeMeasure;
import org.pianoml.backend.model.PracticeTake;
import org.pianoml.backend.security.GrantPrincipal;
import org.pianoml.backend.service.PracticeSessionService;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Tool 9, get_practice_session: one session of the student, its takes and its measures. */
@Component
public class GetPracticeSessionTool implements CoachToolHandler {

  private final CoachRows rows;
  private final PracticeData practice;

  public GetPracticeSessionTool(CoachRows rows, PracticeData practice) {
    this.rows = rows;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "get_practice_session";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    UUID id = args.uuid("sessionId");
    String measures = args.has("measures") ? args.string("measures") : "weakest";
    // find() does not check the owner: another user's session is "not found" too
    PracticeSession session = practice.sessions().find(id)
      .filter(s -> s.getUserId().equals(principal.userId()))
      .orElseThrow(() -> new CoachToolException("SESSION_NOT_FOUND",
        "No practice session with this id. Use get_practice_sessions to find one."));
    PracticeSessionService.Detail detail = practice.sessions().readDetail(session);

    Map<String, Object> data = rows.sessionRow(practice.toApiInfo(session));
    List<PracticeTake> takes = detail.takes();
    data.put("takes", takes.subList(Math.max(0, takes.size() - 20), takes.size()).stream().map(GetPracticeSessionTool::take).toList());
    List<Map<String, Object>> measureRows = switch (measures) {
      case "none" -> List.of();
      case "all" -> detail.measures().stream().sorted(Comparator.comparing(m -> m.getMeasure() == null ? 0 : m.getMeasure()))
        .limit(200).map(GetPracticeSessionTool::measure).toList();
      default -> detail.measures().stream().map(GetPracticeSessionTool::measure).filter(m -> m.get("accuracy") != null)
        .sorted(Comparator.comparing(m -> (Double) m.get("accuracy"))).limit(20).toList();
    };
    data.put("measures", measureRows);
    return data;
  }

  private static int orZero(Integer value) {
    return value == null ? 0 : value;
  }

  private static Map<String, Object> measure(PracticeMeasure m) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("measure", m.getMeasure());
    row.put("notesExpected", m.getNotesExpected());
    row.put("notesHit", m.getNotesHit());
    row.put("notesWrong", m.getNotesWrong());
    row.put("onsets", m.getOnsets());
    row.put("waits", m.getWaits());
    row.put("accuracy", PracticeSessionService.accuracy(orZero(m.getNotesExpected()), orZero(m.getNotesHit()), orZero(m.getNotesWrong())));
    return row;
  }

  private static Map<String, Object> take(PracticeTake t) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("startedAt", CoachRows.iso(t.getStartedAt()));
    row.put("activeSeconds", t.getActiveSeconds());
    row.put("measureStart", t.getMeasureStart());
    row.put("measureEnd", t.getMeasureEnd());
    row.put("hands", t.getHands());
    row.put("tempoFactor", t.getTempoFactor());
    row.put("completed", t.getCompleted());
    row.put("notesExpected", t.getNotesExpected());
    row.put("notesHit", t.getNotesHit());
    row.put("notesWrong", t.getNotesWrong());
    row.put("onsets", t.getOnsets());
    row.put("waits", t.getWaits());
    row.put("accuracy", PracticeSessionService.accuracy(orZero(t.getNotesExpected()), orZero(t.getNotesHit()), orZero(t.getNotesWrong())));
    row.put("flow", PracticeSessionService.flow(orZero(t.getNotesExpected()), orZero(t.getNotesHit()), orZero(t.getNotesWrong()), orZero(t.getWaits())));
    return row;
  }
}
