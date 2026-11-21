package org.pianoml.backend.coach.tools;

import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.PracticeSessionApiInfo;
import org.pianoml.backend.model.PracticeSummary;
import org.pianoml.backend.service.PracticeSessionService;
import org.pianoml.backend.service.PracticeSummaryService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/** The practice services as the coach tools use them (coach, issue #414). */
@Component
public class PracticeData {

  private final PracticeSummaryService summaries;
  private final PracticeSessionService sessions;

  public PracticeData(PracticeSummaryService summaries, PracticeSessionService sessions) {
    this.summaries = summaries;
    this.sessions = sessions;
  }

  public PracticeSummary summary(User user, String timeZone) {
    return summaries.summary(user, timeZone);
  }

  public List<PracticeSession> recent(User user, int limit, String kind, UUID scoreId) {
    return sessions.recent(user, limit, kind, scoreId);
  }

  public PracticeSessionApiInfo toApiInfo(PracticeSession session) {
    return sessions.toApiInfo(session, sessions.slugOf(session));
  }

  public PracticeSessionService sessions() {
    return sessions;
  }
}
