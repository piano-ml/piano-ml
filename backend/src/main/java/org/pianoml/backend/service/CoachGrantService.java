package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.CoachGrant;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.CoachGrantRepository;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Access grants for external AI tools (coach, issue #414).
 *
 * <p>A token is {@code pml_<grantId>_<secret>}: the grant id as 32 hex digits, then 32 random bytes in base64url
 * without padding (43 characters). Only the hex SHA-256 of the 32 secret bytes is stored, so a database leak
 * gives no usable token. Tokens are checked against the database on every request: revocation is immediate.
 */
@Slf4j
@Service
public class CoachGrantService {

  public static final String TOKEN_PREFIX = "pml_";
  public static final Set<String> SCOPES = Set.of("practice:read", "scores:read", "player:control");
  public static final int MAX_LIVE_GRANTS = 5;
  public static final int MAX_NAME_LENGTH = 80;
  public static final int DEFAULT_EXPIRY_DAYS = 90;
  public static final int MAX_EXPIRY_DAYS = 365;
  /** An OAuth grant lasts this long from consent, whatever its refresh tokens do (docs/coach-oauth-design.md 2.4). */
  public static final int OAUTH_GRANT_DAYS = 365;
  private static final List<String> SCOPES_ORDER = List.of("practice:read", "scores:read", "player:control");
  /** Expired or revoked grants are kept this long (the account page still lists them), then deleted. */
  static final Duration KEEP_STALE = Duration.ofDays(30);
  /** {@code last_used_at} is written at most this often per grant. */
  static final Duration TOUCH_INTERVAL = Duration.ofMinutes(1);

  private static final Pattern TOKEN = Pattern.compile("^pml_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$");
  private static final int SECRET_BYTES = 32;

  private final CoachGrantRepository repository;
  private final Clock clock;
  private final SecureRandom random = new SecureRandom();

  public CoachGrantService(CoachGrantRepository repository, Clock clock) {
    this.repository = repository;
    this.clock = clock;
  }

  /** A new grant and the only copy of its token. */
  public record Created(CoachGrant grant, String token) {
  }

  /** The user already has {@link #MAX_LIVE_GRANTS} live grants. */
  public static class TooManyGrantsException extends RuntimeException {
    public TooManyGrantsException() {
      super("At most " + MAX_LIVE_GRANTS + " access grants can be active at the same time. Revoke one first.");
    }
  }

  /**
   * Creates a personal access token grant.
   *
   * @throws IllegalArgumentException for an empty or too long name, no or unknown scopes, or an expiry out of range
   * @throws TooManyGrantsException   when the user already has {@link #MAX_LIVE_GRANTS} live grants
   */
  @Transactional
  public Created create(User user, String name, List<String> scopes, Integer expiresInDays) {
    String trimmed = name == null ? "" : name.strip();
    if (trimmed.isEmpty() || trimmed.length() > MAX_NAME_LENGTH) {
      throw new IllegalArgumentException("The name must have 1 to " + MAX_NAME_LENGTH + " characters.");
    }
    if (scopes == null || scopes.isEmpty() || !SCOPES.containsAll(scopes)) {
      throw new IllegalArgumentException("Choose one or more scopes among " + SCOPES + ".");
    }
    int days = expiresInDays == null ? DEFAULT_EXPIRY_DAYS : expiresInDays;
    if (days < 1 || days > MAX_EXPIRY_DAYS) {
      throw new IllegalArgumentException("The expiry must be 1 to " + MAX_EXPIRY_DAYS + " days.");
    }
    OffsetDateTime now = now();
    if (repository.countLive(user.getId(), CoachGrant.KIND_PAT, now) >= MAX_LIVE_GRANTS) {
      throw new TooManyGrantsException();
    }

    byte[] secret = new byte[SECRET_BYTES];
    random.nextBytes(secret);
    UUID id = UUID.randomUUID();

    CoachGrant grant = new CoachGrant();
    grant.setId(id);
    grant.setUserId(user.getId());
    grant.setName(trimmed);
    grant.setKind(CoachGrant.KIND_PAT);
    grant.setSecretHash(sha256Hex(secret));
    grant.setScopes(String.join(" ", new LinkedHashSet<>(scopes)));
    grant.setCreatedAt(now);
    grant.setExpiresAt(now.plusDays(days));
    repository.save(grant);

    String token = TOKEN_PREFIX + id.toString().replace("-", "")
      + "_" + Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
    Arrays.fill(secret, (byte) 0);
    log.info("Coach grant {} created for user {}", id, user.getId());
    return new Created(grant, token);
  }

  /** The user's grants, newest first, including revoked and expired ones not yet deleted. */
  public List<CoachGrant> list(User user) {
    return repository.findByUserIdOrderByCreatedAtDesc(user.getId());
  }

  /** Revokes one of the user's grants; false when the user has no grant with this id. Idempotent. */
  @Transactional
  public boolean revoke(User user, UUID grantId) {
    Optional<CoachGrant> grant = repository.findByIdAndUserId(grantId, user.getId());
    if (grant.isEmpty()) {
      return false;
    }
    if (grant.get().getRevokedAt() == null) {
      grant.get().setRevokedAt(now());
      repository.save(grant.get());
      log.info("Coach grant {} revoked by user {}", grantId, user.getId());
    }
    return true;
  }

  /** Revokes every grant of a user: to be called when their password is reset or changed. */
  public int revokeAll(UUID userId) {
    return repository.revokeAllOf(userId, now());
  }

  /**
   * The grant a token stands for, when it exists and is neither revoked nor expired. Never throws for a bad
   * token. Records the use ({@code last_used_at}, at most once a minute).
   */
  public Optional<GrantPrincipal> authenticate(String token) {
    if (token == null) {
      return Optional.empty();
    }
    Matcher m = TOKEN.matcher(token);
    if (!m.matches()) {
      return Optional.empty();
    }
    UUID id = parseHexUuid(m.group(1));
    byte[] secret;
    try {
      secret = Base64.getUrlDecoder().decode(m.group(2));
    } catch (IllegalArgumentException e) {
      return Optional.empty();
    }
    Optional<CoachGrant> found = repository.findById(id);
    if (found.isEmpty()) {
      return Optional.empty();
    }
    CoachGrant grant = found.get();
    OffsetDateTime now = now();
    boolean hashMatches = MessageDigest.isEqual(
      grant.getSecretHash().getBytes(StandardCharsets.US_ASCII),
      sha256Hex(secret).getBytes(StandardCharsets.US_ASCII));
    if (!hashMatches || !CoachGrant.KIND_PAT.equals(grant.getKind()) || grant.getRevokedAt() != null
      || !grant.getExpiresAt().isAfter(now)) {
      return Optional.empty();
    }
    repository.touch(id, now, now.minus(TOUCH_INTERVAL));
    return Optional.of(new GrantPrincipal(grant.getUserId(), grant.getId(), grant.getName(), scopesOf(grant)));
  }

  /**
   * Creates the grant an OAuth authorization produced (phase O4): kind oauth, named after the client, valid
   * {@link #OAUTH_GRANT_DAYS} days from now, absolute. It replaces the user's previous live grant for the same
   * client (one connection per application: Claude's web, desktop and mobile apps share one client), and, when
   * the user already has {@link #MAX_LIVE_GRANTS} live OAuth grants, the least recently used one: connecting an
   * application never fails for that, and never touches personal access tokens. No secret: OAuth grants are
   * reached through their tokens only, and a {@code pml_} token can never match one.
   */
  @Transactional
  public CoachGrant createOAuth(UUID userId, String clientId, String clientName, Set<String> scopes) {
    OffsetDateTime now = now();
    List<CoachGrant> live = repository.findLiveOAuth(userId, now);
    for (CoachGrant previous : live) {
      if (clientId.equals(previous.getClientId())) {
        repository.revokeById(previous.getId(), now);
      }
    }
    List<CoachGrant> others = live.stream().filter(g -> !clientId.equals(g.getClientId())).toList();
    for (int i = 0; i <= others.size() - MAX_LIVE_GRANTS; i++) {
      repository.revokeById(others.get(i).getId(), now);
    }
    byte[] unusable = new byte[SECRET_BYTES];
    random.nextBytes(unusable);
    CoachGrant grant = new CoachGrant();
    grant.setId(UUID.randomUUID());
    grant.setUserId(userId);
    grant.setName(clientName.length() > MAX_NAME_LENGTH ? clientName.substring(0, MAX_NAME_LENGTH) : clientName);
    grant.setKind(CoachGrant.KIND_OAUTH);
    grant.setSecretHash(sha256Hex(unusable));
    grant.setScopes(String.join(" ", SCOPES_ORDER.stream().filter(scopes::contains).toList()));
    grant.setCreatedAt(now);
    grant.setExpiresAt(now.plusDays(OAUTH_GRANT_DAYS));
    grant.setClientId(clientId);
    repository.save(grant);
    log.info("Coach OAuth grant {} created for user {} and client {}", grant.getId(), userId, clientId);
    return grant;
  }

  /** Revokes one grant by id, whoever owns it: a reused code or refresh token means theft. */
  public void revokeById(UUID grantId) {
    if (repository.revokeById(grantId, now()) > 0) {
      log.warn("Coach grant {} revoked: a code or refresh token was used twice", grantId);
    }
  }

  /** Deletes the grants expired or revoked more than 30 days ago. */
  public int purgeStale() {
    int deleted = repository.deleteStale(now().minus(KEEP_STALE));
    if (deleted > 0) {
      log.info("Coach grants: {} expired or revoked grant(s) deleted", deleted);
    }
    return deleted;
  }

  public static Set<String> scopesOf(CoachGrant grant) {
    return Set.of(grant.getScopes().trim().split("\\s+"));
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock);
  }

  private static UUID parseHexUuid(String hex) {
    return new UUID(Long.parseUnsignedLong(hex.substring(0, 16), 16), Long.parseUnsignedLong(hex.substring(16), 16));
  }

  static String sha256Hex(byte[] value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is not available", e);
    }
  }
}
