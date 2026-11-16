package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.model.PracticeDay;
import org.pianoml.backend.model.PracticeRegularity;
import org.pianoml.backend.model.PracticeSummary;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Tool 3, get_practice_calendar: practice day by day over the last {@code days} days. */
@Component
public class GetPracticeCalendarTool implements CoachToolHandler {

  /** Same threshold as PracticeSummaryService.PRACTICE_DAY_SECONDS: active time that makes a practice day. */
  static final int PRACTICE_DAY_SECONDS = 60;

  private final CoachRows rows;
  private final PracticeData practice;

  public GetPracticeCalendarTool(CoachRows rows, PracticeData practice) {
    this.rows = rows;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "get_practice_calendar";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int days = args.integer("days", 30);
    PracticeSummary s = practice.summary(rows.user(principal), args.timeZone("timeZone"));
    PracticeRegularity r = s.getRegularity() == null ? new PracticeRegularity() : s.getRegularity();
    LocalDate today = s.getGeneratedAt().atZoneSameInstant(ZoneId.of(s.getTimeZone())).toLocalDate();
    LocalDate first = today.minusDays(days - 1L);

    List<PracticeDay> inPeriod = (r.getDaily() == null ? List.<PracticeDay>of() : r.getDaily()).stream()
      .filter(d -> !d.getDate().isBefore(first)).toList();

    Map<String, Object> data = new LinkedHashMap<>();
    data.put("currentStreakDays", r.getCurrentStreakDays());
    data.put("longestStreakDays", r.getLongestStreakDays());
    data.put("lastPracticeDate", CoachRows.iso(r.getLastPracticeDate()));
    data.put("averageSessionSeconds", r.getAverageSessionSeconds());
    data.put("days", inPeriod.stream().map(d -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("date", d.getDate().toString());
      m.put("activeSeconds", d.getActiveSeconds());
      m.put("sessions", d.getSessions());
      return m;
    }).toList());
    data.put("practicedDays", inPeriod.stream().filter(d -> d.getActiveSeconds() != null && d.getActiveSeconds() >= PRACTICE_DAY_SECONDS).count());
    data.put("totalActiveSeconds", inPeriod.stream().mapToLong(d -> d.getActiveSeconds() == null ? 0 : d.getActiveSeconds()).sum());
    return data;
  }
}
