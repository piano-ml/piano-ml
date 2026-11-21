package org.pianoml.backend.coach.oauth;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A fixed-window counter per key, in memory, per instance (coach, issue #414): approximate when several instances
 * run, like {@code CoachRateLimiter}. For unauthenticated OAuth endpoints, keyed by client address.
 */
public class FixedWindowLimiter {

  private static final int MAX_TRACKED = 50_000;

  private final int limit;
  private final long windowMillis;
  private final Clock clock;
  private final Map<String, Window> windows = new ConcurrentHashMap<>();

  private record Window(long index, int count) {
  }

  public FixedWindowLimiter(int limit, Duration window, Clock clock) {
    this.limit = limit;
    this.windowMillis = window.toMillis();
    this.clock = clock;
  }

  /** Counts one request for this key; false once the key is over the limit in the current window. */
  public boolean tryAcquire(String key) {
    long index = clock.millis() / windowMillis;
    if (windows.size() > MAX_TRACKED) {
      windows.values().removeIf(w -> w.index() < index);
    }
    Window window = windows.compute(key, (k, w) ->
      w == null || w.index() != index ? new Window(index, 1) : new Window(index, w.count() + 1));
    return window.count() <= limit;
  }
}
