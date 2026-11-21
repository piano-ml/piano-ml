package org.pianoml.backend.coach.bridge;

import org.pianoml.backend.entity.CoachWsTicket;
import org.pianoml.backend.repository.CoachWsTicketRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One-time tickets that open the Remote coach WebSocket (issue #414). A ticket is 32 random bytes in base64url;
 * only its SHA-256 is stored, with the user and an expiry. It is opaque on purpose: a signed JWT would be
 * accepted as a session by JwtTokenProvider.
 */
@Service
public class BridgeTicketService {

  private static final int MAX_TRACKED = 10_000;

  private final CoachWsTicketRepository repository;
  private final Clock clock;
  private final Duration ttl;
  private final int perMinute;
  private final SecureRandom random = new SecureRandom();
  private final Map<UUID, long[]> windows = new ConcurrentHashMap<>(); // userId -> {minute, count}

  public BridgeTicketService(CoachWsTicketRepository repository, Clock clock,
                             @Value("${coach.bridge.ticket-ttl:PT30S}") Duration ttl,
                             @Value("${coach.bridge.tickets-per-minute:10}") int perMinute) {
    this.repository = repository;
    this.clock = clock;
    this.ttl = ttl;
    this.perMinute = perMinute;
  }

  public record Ticket(String value, int expiresInSeconds) {
  }

  /** A new ticket for the user, or empty when the user is over the limit for the current minute. */
  public Optional<Ticket> issue(UUID userId) {
    if (!tryAcquire(userId)) {
      return Optional.empty();
    }
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    CoachWsTicket ticket = new CoachWsTicket();
    ticket.setTicketHash(sha256Hex(value));
    ticket.setUserId(userId);
    ticket.setExpiresAt(OffsetDateTime.now(clock).plus(ttl));
    repository.save(ticket);
    return Optional.of(new Ticket(value, (int) ttl.toSeconds()));
  }

  /** The user of a valid ticket, which is used up; empty for an unknown, used or expired ticket. */
  public Optional<UUID> consume(String value) {
    if (value == null || value.isBlank() || value.length() > 100) {
      return Optional.empty();
    }
    String hash = sha256Hex(value);
    // Read the owner first, then delete: valid only if this call deleted the row
    Optional<UUID> owner = repository.findById(hash).map(CoachWsTicket::getUserId);
    if (owner.isEmpty() || repository.consume(hash, OffsetDateTime.now(clock)) != 1) {
      return Optional.empty();
    }
    return owner;
  }

  public int deleteExpired() {
    return repository.deleteExpired(OffsetDateTime.now(clock));
  }

  private boolean tryAcquire(UUID userId) {
    long minute = clock.millis() / 60_000;
    if (windows.size() > MAX_TRACKED) {
      windows.values().removeIf(w -> w[0] < minute);
    }
    long[] window = windows.compute(userId, (id, w) -> w == null || w[0] != minute ? new long[] {minute, 1} : new long[] {minute, w[1] + 1});
    return window[1] <= perMinute;
  }

  static String sha256Hex(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
