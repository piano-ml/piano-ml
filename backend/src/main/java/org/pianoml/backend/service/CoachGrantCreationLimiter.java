package org.pianoml.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-user limit of access grant creations (coach, issue #414): {@code coach.grants.creations-per-hour} per user
 * and clock hour (fixed window), in memory, per instance. Stops a script or a stuck client from minting tokens
 * in a loop; approximate when several instances run.
 */
@Component
public class CoachGrantCreationLimiter {

  /** Above this many tracked users, the windows of past hours are dropped */
  private static final int MAX_TRACKED = 10_000;

  private final int perHour;
  private final Clock clock;
  private final Map<UUID, Window> windows = new ConcurrentHashMap<>();

  private record Window(long hour, int count) {
  }

  public CoachGrantCreationLimiter(@Value("${coach.grants.creations-per-hour:10}") int perHour, Clock clock) {
    this.perHour = perHour;
    this.clock = clock;
  }

  /** Counts one creation for this user; false once the user is over the limit for the current hour. */
  public boolean tryAcquire(UUID userId) {
    long hour = clock.millis() / 3_600_000;
    if (windows.size() > MAX_TRACKED) {
      windows.values().removeIf(w -> w.hour() < hour);
    }
    Window window = windows.compute(userId, (id, w) ->
      w == null || w.hour() != hour ? new Window(hour, 1) : new Window(hour, w.count() + 1));
    return window.count() <= perHour;
  }
}
