package org.pianoml.backend.coach;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-grant limit of MCP tool calls (coach, issue #414): {@code coach.mcp.calls-per-minute} per grant and minute
 * (fixed window), in memory, per instance. Approximate when several instances run.
 */
@Component
public class CoachRateLimiter {

  /** Above this many tracked grants, the windows of past minutes are dropped */
  private static final int MAX_TRACKED = 10_000;

  private final int perMinute;
  private final Clock clock;
  private final Map<UUID, Window> windows = new ConcurrentHashMap<>();

  private record Window(long minute, int count) {
  }

  public CoachRateLimiter(@Value("${coach.mcp.calls-per-minute:60}") int perMinute, Clock clock) {
    this.perMinute = perMinute;
    this.clock = clock;
  }

  /** Counts one call of this grant; false once the grant is over the limit for the current minute. */
  public boolean tryAcquire(UUID grantId) {
    long minute = clock.millis() / 60_000;
    if (windows.size() > MAX_TRACKED) {
      windows.values().removeIf(w -> w.minute() < minute);
    }
    Window window = windows.compute(grantId, (id, w) ->
      w == null || w.minute() != minute ? new Window(minute, 1) : new Window(minute, w.count() + 1));
    return window.count() <= perMinute;
  }
}
