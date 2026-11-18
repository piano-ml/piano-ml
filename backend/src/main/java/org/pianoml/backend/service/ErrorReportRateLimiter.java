package org.pianoml.backend.service;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-IP limit of {@code POST /error-report} (issue #408): {@code errors.ingest.rate-per-minute} reports per
 * client address and minute (fixed window), in memory, per instance. Enough to stop a browser stuck in an
 * error loop or a naive flood from filling the table; not a defense against a distributed attack.
 */
@Component
public class ErrorReportRateLimiter {

  /** Above this many tracked addresses, the windows of past minutes are dropped */
  private static final int MAX_TRACKED = 10_000;

  private final int perMinute;
  private final Clock clock;
  private final Map<String, Window> windows = new ConcurrentHashMap<>();

  private record Window(long minute, int count) {
  }

  public ErrorReportRateLimiter(@Value("${errors.ingest.rate-per-minute:30}") int perMinute, Clock clock) {
    this.perMinute = perMinute;
    this.clock = clock;
  }

  /** Counts one report from this client; false once the client is over the limit for the current minute. */
  public boolean tryAcquire(HttpServletRequest request) {
    long minute = clock.millis() / 60_000;
    if (windows.size() > MAX_TRACKED) {
      windows.values().removeIf(w -> w.minute() < minute);
    }
    Window window = windows.compute(clientAddress(request), (ip, w) ->
      w == null || w.minute() != minute ? new Window(minute, 1) : new Window(minute, w.count() + 1));
    return window.count() <= perMinute;
  }

  /**
   * The client's address. Behind Cloud Run's front end the TCP peer is Google's proxy, which appends the real
   * client address to X-Forwarded-For: the last entry is the one it added (earlier ones are client-supplied).
   */
  static String clientAddress(HttpServletRequest request) {
    String forwarded = request.getHeader("X-Forwarded-For");
    if (forwarded != null && !forwarded.isBlank()) {
      String[] hops = forwarded.split(",");
      String last = hops[hops.length - 1].strip();
      if (!last.isEmpty()) {
        return last;
      }
    }
    return request.getRemoteAddr();
  }
}
