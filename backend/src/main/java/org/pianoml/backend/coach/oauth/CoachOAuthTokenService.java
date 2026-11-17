package org.pianoml.backend.coach.oauth;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.CoachGrant;
import org.pianoml.backend.entity.CoachOAuthCode;
import org.pianoml.backend.entity.CoachOAuthToken;
import org.pianoml.backend.repository.CoachGrantRepository;
import org.pianoml.backend.repository.CoachOAuthCodeRepository;
import org.pianoml.backend.repository.CoachOAuthTokenRepository;
import org.pianoml.backend.security.GrantPrincipal;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Tokens of the coach OAuth server (issue #414, docs/coach-oauth-design.md 2.4): the code exchange with PKCE, refresh
 * with rotation and reuse detection, revocation, and the authentication of {@code pmo_} access tokens on /mcp.
 *
 * <p>Access tokens {@code pmo_<43 base64url>} last 1 hour, refresh tokens {@code pmr_<43 base64url>} 60 days, both
 * capped by the grant's expiry; only their SHA-256 is stored. A code or refresh token used twice revokes the grant
 * it produced: one of the two users is a thief, and the server cannot tell which.
 */
@Slf4j
@Service
public class CoachOAuthTokenService {

  public static final String ACCESS_PREFIX = "pmo_";
  public static final String REFRESH_PREFIX = "pmr_";
  static final Duration ACCESS_LIFETIME = Duration.ofHours(1);
  static final Duration REFRESH_LIFETIME = Duration.ofDays(60);
  private static final Pattern VERIFIER = Pattern.compile("^[A-Za-z0-9._~-]{43,128}$");
  private static final Pattern ACCESS = Pattern.compile("^pmo_[A-Za-z0-9_-]{43}$");
  private static final Duration TOUCH_INTERVAL = Duration.ofMinutes(1);

  /** An RFC 6749 error of the token endpoint. */
  public static class TokenException extends RuntimeException {
    private final String error;

    public TokenException(String error, String description) {
      super(description);
      this.error = error;
    }

    public String error() {
      return error;
    }
  }

  /** A successful token response. */
  public record Issued(String accessToken, long expiresIn, String refreshToken, String scope) {
  }

  private final CoachOAuthSettings settings;
  private final CoachOAuthCodeRepository codes;
  private final CoachOAuthTokenRepository tokens;
  private final CoachGrantRepository grantRepository;
  private final CoachGrantService grants;
  private final CoachOAuthClientService clients;
  private final Clock clock;

  public CoachOAuthTokenService(CoachOAuthSettings settings, CoachOAuthCodeRepository codes,
                                CoachOAuthTokenRepository tokens, CoachGrantRepository grantRepository,
                                CoachGrantService grants, CoachOAuthClientService clients, Clock clock) {
    this.settings = settings;
    this.codes = codes;
    this.tokens = tokens;
    this.grantRepository = grantRepository;
    this.grants = grants;
    this.clients = clients;
    this.clock = clock;
  }

  // --- grant_type=authorization_code -----------------------------------------------------------------------------

  @Transactional(noRollbackFor = TokenException.class)
  public Issued exchangeCode(String code, String clientId, String redirectUri, String verifier, String resource) {
    require(code, "code");
    require(clientId, "client_id");
    require(redirectUri, "redirect_uri");
    require(verifier, "code_verifier");
    OffsetDateTime now = OffsetDateTime.now(clock);
    String hash = OAuthSecrets.hash(code);
    CoachOAuthCode row = codes.findById(hash)
      .orElseThrow(() -> new TokenException("invalid_grant", "Unknown or expired code."));
    if (row.getUsedAt() != null) {
      if (row.getGrantId() != null) {
        grants.revokeById(row.getGrantId());
      }
      throw new TokenException("invalid_grant", "This code was already used.");
    }
    if (!row.getExpiresAt().isAfter(now)) {
      throw new TokenException("invalid_grant", "Unknown or expired code.");
    }
    if (!row.getClientId().equals(clientId)) {
      throw new TokenException("invalid_grant", "This code was issued to another client.");
    }
    if (!row.getRedirectUri().equals(redirectUri)) {
      throw new TokenException("invalid_grant", "redirect_uri differs from the authorization request.");
    }
    if (!VERIFIER.matcher(verifier).matches() || !s256Matches(verifier, row.getCodeChallenge())) {
      throw new TokenException("invalid_grant", "code_verifier does not match the code_challenge.");
    }
    if (resource != null && !resource.equals(row.getResource())) {
      throw new TokenException("invalid_target", "The only resource is " + row.getResource() + ".");
    }
    // Single use, also against a concurrent request with the same code: only one caller marks it
    if (codes.markUsed(hash, now) != 1) {
      throw new TokenException("invalid_grant", "This code was already used.");
    }
    String clientName = clientName(clientId);
    CoachGrant grant = grants.createOAuth(row.getUserId(), clientId, clientName,
      Set.of(row.getScopes().split(" ")));
    codes.setGrant(hash, grant.getId());
    return issue(grant, clientId, row.getResource(), now);
  }

  // --- grant_type=refresh_token ----------------------------------------------------------------------------------

  @Transactional(noRollbackFor = TokenException.class)
  public Issued refresh(String refreshToken, String clientId, String resource) {
    require(refreshToken, "refresh_token");
    require(clientId, "client_id");
    OffsetDateTime now = OffsetDateTime.now(clock);
    String hash = OAuthSecrets.hash(refreshToken);
    CoachOAuthToken row = tokens.findById(hash)
      .filter(t -> CoachOAuthToken.KIND_REFRESH.equals(t.getKind()))
      .orElseThrow(() -> new TokenException("invalid_grant", "Unknown refresh token."));
    if (!row.getClientId().equals(clientId)) {
      throw new TokenException("invalid_grant", "This refresh token was issued to another client.");
    }
    if (row.getUsedAt() != null || tokens.markUsed(hash, now) != 1) {
      grants.revokeById(row.getGrantId());
      throw new TokenException("invalid_grant", "This refresh token was already used.");
    }
    if (!row.getExpiresAt().isAfter(now)) {
      throw new TokenException("invalid_grant", "The refresh token has expired.");
    }
    if (resource != null && !resource.equals(row.getResource())) {
      throw new TokenException("invalid_target", "The only resource is " + row.getResource() + ".");
    }
    CoachGrant grant = grantRepository.findById(row.getGrantId())
      .filter(g -> g.getRevokedAt() == null && g.getExpiresAt().isAfter(now))
      .orElseThrow(() -> new TokenException("invalid_grant", "The access was revoked or has expired."));
    return issue(grant, clientId, row.getResource(), now);
  }

  // --- POST /oauth/revoke ----------------------------------------------------------------------------------------

  /**
   * RFC 7009: revoking a refresh token revokes its grant (every token of the connection); revoking an access token
   * ends that token. Unknown tokens, and tokens of another client, are silently ignored.
   */
  public void revoke(String token, String clientId) {
    if (token == null || clientId == null) {
      return;
    }
    String hash = OAuthSecrets.hash(token);
    tokens.findById(hash).filter(t -> t.getClientId().equals(clientId)).ifPresent(t -> {
      if (CoachOAuthToken.KIND_REFRESH.equals(t.getKind())) {
        grantRepository.revokeById(t.getGrantId(), OffsetDateTime.now(clock));
      } else {
        tokens.expire(hash, OffsetDateTime.now(clock));
      }
    });
  }

  // --- /mcp ------------------------------------------------------------------------------------------------------

  /**
   * The grant a {@code pmo_} access token stands for: the token unexpired and issued for this server's resource, its
   * grant neither revoked nor expired. Never throws for a bad token. Records the use, at most once a minute.
   */
  public Optional<GrantPrincipal> authenticate(String token) {
    if (token == null || !ACCESS.matcher(token).matches()) {
      return Optional.empty();
    }
    OffsetDateTime now = OffsetDateTime.now(clock);
    Optional<CoachOAuthToken> row = tokens.findById(OAuthSecrets.hash(token))
      .filter(t -> CoachOAuthToken.KIND_ACCESS.equals(t.getKind()) && t.getExpiresAt().isAfter(now)
        && settings.resource().equals(t.getResource()));
    if (row.isEmpty()) {
      return Optional.empty();
    }
    return grantRepository.findById(row.get().getGrantId())
      .filter(g -> CoachGrant.KIND_OAUTH.equals(g.getKind()) && g.getRevokedAt() == null && g.getExpiresAt().isAfter(now))
      .map(g -> {
        grantRepository.touch(g.getId(), now, now.minus(TOUCH_INTERVAL));
        return new GrantPrincipal(g.getUserId(), g.getId(), g.getName(), CoachGrantService.scopesOf(g));
      });
  }

  /** Deletes tokens expired more than a day ago. Idempotent. */
  public int purgeExpired() {
    return tokens.deleteExpiredBefore(OffsetDateTime.now(clock).minusDays(1));
  }

  // --- helpers ---------------------------------------------------------------------------------------------------

  private Issued issue(CoachGrant grant, String clientId, String resource, OffsetDateTime now) {
    OffsetDateTime accessExpiry = min(now.plus(ACCESS_LIFETIME), grant.getExpiresAt());
    OffsetDateTime refreshExpiry = min(now.plus(REFRESH_LIFETIME), grant.getExpiresAt());
    String access = ACCESS_PREFIX + OAuthSecrets.random();
    String refresh = REFRESH_PREFIX + OAuthSecrets.random();
    tokens.save(token(access, CoachOAuthToken.KIND_ACCESS, grant, clientId, resource, now, accessExpiry));
    tokens.save(token(refresh, CoachOAuthToken.KIND_REFRESH, grant, clientId, resource, now, refreshExpiry));
    return new Issued(access, Duration.between(now, accessExpiry).toSeconds(), refresh, grant.getScopes());
  }

  private static CoachOAuthToken token(String value, String kind, CoachGrant grant, String clientId, String resource,
                                       OffsetDateTime now, OffsetDateTime expiresAt) {
    CoachOAuthToken t = new CoachOAuthToken();
    t.setTokenHash(OAuthSecrets.hash(value));
    t.setGrantId(grant.getId());
    t.setKind(kind);
    t.setClientId(clientId);
    t.setResource(resource);
    t.setCreatedAt(now);
    t.setExpiresAt(expiresAt);
    return t;
  }

  private String clientName(String clientId) {
    try {
      return clients.resolve(clientId).map(CoachOAuthClientService.OAuthClient::name).orElse(clientId);
    } catch (ClientMetadataException e) {
      log.info("Client metadata of {} unavailable at token time: {}", clientId, e.getMessage());
      return clientId.length() > CoachGrantService.MAX_NAME_LENGTH
        ? clientId.substring(0, CoachGrantService.MAX_NAME_LENGTH) : clientId;
    }
  }

  /** BASE64URL(SHA-256(ASCII(verifier))) == challenge (RFC 7636 4.6), compared in constant time. */
  static boolean s256Matches(String verifier, String challenge) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
      String computed = Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
      return MessageDigest.isEqual(computed.getBytes(StandardCharsets.US_ASCII), challenge.getBytes(StandardCharsets.US_ASCII));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static void require(String value, String name) {
    if (value == null || value.isEmpty()) {
      throw new TokenException("invalid_request", name + " is required.");
    }
  }

  private static OffsetDateTime min(OffsetDateTime a, OffsetDateTime b) {
    return a.isBefore(b) ? a : b;
  }
}
