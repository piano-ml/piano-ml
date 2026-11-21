package org.pianoml.backend.coach.bridge;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.CoachCommand;
import org.pianoml.backend.repository.CoachCommandRepository;
import org.pianoml.backend.repository.CoachPresenceRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

/**
 * Cross-instance delivery of Remote coach commands, by polling (issue #414): every 300 ms, and only while this
 * instance holds sockets, one query for the pending commands of its tabs. Plus a cleanup every minute, on every
 * instance (idempotent deletes).
 */
@Slf4j
@Component
@Lazy(false) // spring.main.lazy-initialization would otherwise never create it, and never schedule the jobs
@Profile("!job")
@EnableScheduling
public class BridgeCommandPump {

  static final Duration STALE_PRESENCE = Duration.ofMinutes(2);
  static final Duration KEEP_COMMANDS = Duration.ofHours(1);

  private final BridgeSessions sessions;
  private final CoachCommandRepository commands;
  private final CoachPresenceRepository presence;
  private final BridgeTicketService tickets;
  private final Clock clock;

  public BridgeCommandPump(BridgeSessions sessions, CoachCommandRepository commands, CoachPresenceRepository presence,
                           BridgeTicketService tickets, Clock clock) {
    this.sessions = sessions;
    this.commands = commands;
    this.presence = presence;
    this.tickets = tickets;
    this.clock = clock;
  }

  @Scheduled(fixedDelayString = "${coach.bridge.pump-ms:300}")
  public void pump() {
    if (sessions.isEmpty()) {
      return;
    }
    try {
      Set<UUID> tabs = sessions.tabIds();
      for (CoachCommand command : commands.pendingFor(tabs, OffsetDateTime.now(clock))) {
        sessions.deliver(command);
      }
    } catch (RuntimeException e) {
      log.warn("Remote coach pump failed: {}", e.toString());
    }
  }

  @Scheduled(fixedDelayString = "${coach.bridge.cleanup-ms:60000}")
  public void cleanup() {
    try {
      OffsetDateTime now = OffsetDateTime.now(clock);
      presence.deleteStale(now.minus(STALE_PRESENCE));
      tickets.deleteExpired();
      commands.deleteOlderThan(now.minus(KEEP_COMMANDS));
    } catch (RuntimeException e) {
      log.warn("Remote coach cleanup failed: {}", e.toString());
    }
  }
}
