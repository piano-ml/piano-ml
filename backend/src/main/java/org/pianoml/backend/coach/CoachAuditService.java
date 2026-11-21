package org.pianoml.backend.coach;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.CoachAudit;
import org.pianoml.backend.repository.CoachAuditRepository;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.Period;

/** Audit of the coach's tool calls (coach, issue #414), and its retention. */
@Slf4j
@Service
public class CoachAuditService {

  private final CoachAuditRepository repository;
  private final Clock clock;
  private final Period retention;

  public CoachAuditService(CoachAuditRepository repository, Clock clock,
                           @Value("${coach.audit.retention:P3M}") Period retention) {
    this.repository = repository;
    this.clock = clock;
    this.retention = retention;
  }

  /** Records one call. Never throws: a failed audit write must not fail the tool call. */
  public void record(GrantPrincipal principal, String tool, String outcome, long durationMs) {
    try {
      CoachAudit audit = new CoachAudit();
      audit.setAt(OffsetDateTime.now(clock));
      audit.setUserId(principal.userId());
      audit.setGrantId(principal.grantId());
      audit.setTool(tool.length() > 40 ? tool.substring(0, 40) : tool);
      audit.setOutcome(outcome);
      audit.setDurationMs((int) Math.min(Integer.MAX_VALUE, durationMs));
      repository.save(audit);
    } catch (RuntimeException e) {
      log.warn("Coach audit write failed for tool {}: {}", tool, e.toString());
    }
  }

  /** Deletes the audit rows older than the retention period; returns how many. */
  public int purge() {
    int deleted = repository.deleteOlderThan(OffsetDateTime.now(clock).minus(retention));
    if (deleted > 0) {
      log.info("Coach audit: {} row(s) older than {} deleted", deleted, retention);
    }
    return deleted;
  }
}
