package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Tool 8, get_practice_sessions: recent sessions, newest first. */
@Component
public class GetPracticeSessionsTool implements CoachToolHandler {

  private final CoachRows rows;
  private final PracticeData practice;
  private final Clock clock;

  public GetPracticeSessionsTool(CoachRows rows, PracticeData practice, Clock clock) {
    this.rows = rows;
    this.practice = practice;
    this.clock = clock;
  }

  @Override
  public String name() {
    return "get_practice_sessions";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int limit = args.integer("limit", 10);
    String kind = args.string("kind");
    UUID scoreId = args.uuid("scoreId");
    Integer sinceDays = args.integer("sinceDays");
    User user = rows.user(principal);

    List<PracticeSession> sessions;
    if (sinceDays != null) {
      OffsetDateTime since = OffsetDateTime.now(clock).minusDays(sinceDays);
      sessions = practice.recent(user, 100, kind, scoreId).stream()
        .filter(s -> !s.getStartedAt().isBefore(since)).limit(limit).toList();
    } else {
      sessions = practice.recent(user, limit, kind, scoreId);
    }
    return Map.of("sessions", sessions.stream().map(practice::toApiInfo).map(rows::sessionRow).toList());
  }
}
