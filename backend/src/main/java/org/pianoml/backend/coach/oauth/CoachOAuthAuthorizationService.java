package org.pianoml.backend.coach.oauth;

import org.pianoml.backend.entity.CoachOAuthCode;
import org.pianoml.backend.entity.CoachOAuthRequest;
import org.pianoml.backend.repository.CoachOAuthCodeRepository;
import org.pianoml.backend.repository.CoachOAuthRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The authorization step of the coach OAuth server (issue #414, docs/coach-oauth-design.md 2.3).
 *
 * <p>{@link #authorize} validates {@code GET /oauth/authorize} without any session (the cookie does not travel on a
 * cross-site navigation) and stores the request; the user then decides on the SPA consent page, with the session
 * ({@link #view}, {@link #decide}), and the browser is sent back to the client with a code.
 *
 * <p>Until {@code client_id} and {@code redirect_uri} are known to be good, an error is a page on PianoML; after
 * that, a redirect to the client with {@code error}, {@code state} and {@code iss} (RFC 9207).
 */
@Service
public class CoachOAuthAuthorizationService {

  static final Duration REQUEST_LIFETIME = Duration.ofMinutes(10);
  static final Duration CODE_LIFETIME = Duration.ofSeconds(60);
  static final int MAX_STATE_LENGTH = 500;
  private static final Pattern CODE_CHALLENGE = Pattern.compile("^[A-Za-z0-9._~-]{43,128}$");
  private static final Set<String> IGNORED_SCOPES = Set.of("offline_access");

  /** What {@code GET /oauth/authorize} answers. */
  public sealed interface Outcome {
    /** An error shown on PianoML: the redirect URI cannot be trusted. */
    record ErrorPage(String message) implements Outcome {
    }

    /** A redirect: to the consent page, or back to the client with an error. */
    record Redirect(String url) implements Outcome {
    }
  }

  /** What the consent page shows. */
  public record View(String clientName, String clientHost, String redirectHost, boolean loopbackOnly,
                     List<String> scopes, OffsetDateTime expiresAt) {
  }

  private final CoachOAuthSettings settings;
  private final CoachOAuthClientService clients;
  private final CoachOAuthRequestRepository requests;
  private final CoachOAuthCodeRepository codes;
  private final Clock clock;

  public CoachOAuthAuthorizationService(CoachOAuthSettings settings, CoachOAuthClientService clients,
                                        CoachOAuthRequestRepository requests, CoachOAuthCodeRepository codes,
                                        Clock clock) {
    this.settings = settings;
    this.clients = clients;
    this.requests = requests;
    this.codes = codes;
    this.clock = clock;
  }

  // --- GET /oauth/authorize --------------------------------------------------------------------------------------

  public Outcome authorize(Map<String, String[]> params) {
    // 1. Who asks, and where to answer: errors stay on PianoML until both are trusted (no open redirect)
    if (repeated(params, "client_id") || repeated(params, "redirect_uri")) {
      return new Outcome.ErrorPage("client_id and redirect_uri must be given once.");
    }
    String clientId = one(params, "client_id");
    if (clientId == null || clientId.isEmpty()) {
      return new Outcome.ErrorPage("The request does not say which application it comes from (client_id).");
    }
    CoachOAuthClientService.OAuthClient client;
    try {
      Optional<CoachOAuthClientService.OAuthClient> found = clients.resolve(clientId);
      if (found.isEmpty()) {
        return new Outcome.ErrorPage("This application is not registered (unknown client_id).");
      }
      client = found.get();
    } catch (ClientMetadataException e) {
      return new Outcome.ErrorPage("This application's description cannot be used: " + e.getMessage() + ".");
    }
    String redirectUri = one(params, "redirect_uri");
    if (redirectUri == null || !client.allowsRedirect(redirectUri)) {
      return new Outcome.ErrorPage("The address to return to (redirect_uri) is not one this application registered.");
    }

    // 2. From here on, errors go back to the client
    String state = one(params, "state");
    if (state != null && state.length() > MAX_STATE_LENGTH) {
      return error(redirectUri, "invalid_request", "state is too long", null);
    }
    for (String name : List.of("response_type", "code_challenge", "code_challenge_method", "scope", "resource", "state")) {
      if (repeated(params, name)) {
        return error(redirectUri, "invalid_request", name + " is repeated", state);
      }
    }
    if (!"code".equals(one(params, "response_type"))) {
      return error(redirectUri, "unsupported_response_type", "only response_type=code is supported", state);
    }
    String challenge = one(params, "code_challenge");
    if (challenge == null || !CODE_CHALLENGE.matcher(challenge).matches()) {
      return error(redirectUri, "invalid_request", "a PKCE code_challenge is required", state);
    }
    if (!"S256".equals(one(params, "code_challenge_method"))) {
      return error(redirectUri, "invalid_request", "code_challenge_method must be S256", state);
    }
    String resource = one(params, "resource");
    if (resource != null && !settings.resource().equals(resource)) {
      return error(redirectUri, "invalid_target", "the only resource is " + settings.resource(), state);
    }
    List<String> scopes;
    try {
      scopes = requestedScopes(one(params, "scope"));
    } catch (IllegalArgumentException e) {
      return error(redirectUri, "invalid_scope", e.getMessage(), state);
    }

    // 3. Store it for the consent page
    String id = OAuthSecrets.random();
    OffsetDateTime now = OffsetDateTime.now(clock);
    CoachOAuthRequest request = new CoachOAuthRequest();
    request.setIdHash(OAuthSecrets.hash(id));
    request.setClientId(client.clientId());
    request.setClientName(client.name());
    request.setClientHost(client.verifiedHost().orElse(null));
    request.setLoopbackOnly(client.onlyLoopbackRedirects());
    request.setRedirectUri(redirectUri);
    request.setCodeChallenge(challenge);
    request.setScopes(String.join(" ", scopes));
    request.setResource(settings.resource()); // bound to the only resource, also when the client did not say
    request.setState(state);
    request.setCreatedAt(now);
    request.setExpiresAt(now.plus(REQUEST_LIFETIME));
    requests.save(request);
    return new Outcome.Redirect(settings.consentUrl() + "?request=" + id);
  }

  /** The requested scopes, in the advertised order: all of them when none is named; offline_access ignored. */
  static List<String> requestedScopes(String scope) {
    Set<String> asked = new LinkedHashSet<>();
    if (scope != null) {
      for (String s : scope.trim().split("\\s+")) {
        if (s.isEmpty() || IGNORED_SCOPES.contains(s)) {
          continue;
        }
        if (!CoachOAuthSettings.SCOPES.contains(s)) {
          throw new IllegalArgumentException("unknown scope " + s);
        }
        asked.add(s);
      }
    }
    if (asked.isEmpty()) {
      return CoachOAuthSettings.SCOPES;
    }
    return CoachOAuthSettings.SCOPES.stream().filter(asked::contains).toList();
  }

  // --- consent page ----------------------------------------------------------------------------------------------

  /** The pending request {@code id}, binding it to this user if nobody opened it yet. Empty for anyone else. */
  public Optional<View> view(String id, UUID userId) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    String hash = OAuthSecrets.hash(id);
    requests.bind(hash, userId, now);
    return requests.findById(hash)
      .filter(r -> userId.equals(r.getUserId()) && r.getDecidedAt() == null && r.getExpiresAt().isAfter(now))
      .map(r -> new View(r.getClientName(), r.getClientHost(), URI.create(r.getRedirectUri()).getHost(),
        r.isLoopbackOnly(), List.of(r.getScopes().split(" ")), r.getExpiresAt()));
  }

  /**
   * Decides the pending request {@code id}, once. Approving issues a code for the granted scopes (all requested
   * ones when {@code scopes} is null). Empty when there is no such pending request for this user.
   *
   * @return the URL to send the browser to
   * @throws IllegalArgumentException for scopes that were not requested, or none when approving
   */
  @Transactional
  public Optional<String> decide(String id, UUID userId, boolean approve, List<String> scopes) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    String hash = OAuthSecrets.hash(id);
    Optional<CoachOAuthRequest> pending = requests.findById(hash)
      .filter(r -> (r.getUserId() == null || userId.equals(r.getUserId())) && r.getDecidedAt() == null
        && r.getExpiresAt().isAfter(now));
    if (pending.isEmpty()) {
      return Optional.empty();
    }
    CoachOAuthRequest request = pending.get();
    List<String> requested = List.of(request.getScopes().split(" "));
    List<String> granted = requested;
    if (approve && scopes != null) {
      if (scopes.isEmpty() || !requested.containsAll(scopes)) {
        throw new IllegalArgumentException("Grant one or more of the requested scopes.");
      }
      granted = requested.stream().filter(scopes::contains).toList();
    }
    if (requests.decide(hash, userId, now) != 1) {
      return Optional.empty(); // decided meanwhile, by another tab or another user
    }
    if (!approve) {
      return Optional.of(redirect(request.getRedirectUri(), params("error", "access_denied",
        "error_description", "The user refused.", "state", request.getState())));
    }
    String code = OAuthSecrets.random();
    CoachOAuthCode row = new CoachOAuthCode();
    row.setCodeHash(OAuthSecrets.hash(code));
    row.setClientId(request.getClientId());
    row.setRedirectUri(request.getRedirectUri());
    row.setCodeChallenge(request.getCodeChallenge());
    row.setScopes(String.join(" ", granted));
    row.setResource(request.getResource());
    row.setUserId(userId);
    row.setCreatedAt(now);
    row.setExpiresAt(now.plus(CODE_LIFETIME));
    codes.save(row);
    clients.markUsed(request.getClientId());
    return Optional.of(redirect(request.getRedirectUri(), params("code", code, "state", request.getState())));
  }

  /** Deletes requests and codes expired more than a day ago. Idempotent. */
  public void purgeExpired() {
    OffsetDateTime cutoff = OffsetDateTime.now(clock).minusDays(1);
    requests.deleteExpiredBefore(cutoff);
    codes.deleteExpiredBefore(cutoff);
  }

  // --- helpers ---------------------------------------------------------------------------------------------------

  private Outcome error(String redirectUri, String error, String description, String state) {
    return new Outcome.Redirect(redirect(redirectUri, params("error", error, "error_description", description, "state", state)));
  }

  /** The redirect URI with the parameters and {@code iss} appended to its query, skipping null values. */
  private String redirect(String redirectUri, List<String[]> parameters) {
    List<String[]> all = new ArrayList<>(parameters);
    all.add(new String[]{"iss", settings.issuer()});
    StringBuilder url = new StringBuilder(redirectUri);
    char separator = redirectUri.contains("?") ? '&' : '?';
    for (String[] p : all) {
      if (p[1] == null) {
        continue;
      }
      url.append(separator).append(p[0]).append('=').append(URLEncoder.encode(p[1], StandardCharsets.UTF_8));
      separator = '&';
    }
    return url.toString();
  }

  private static List<String[]> params(String... keyValues) {
    List<String[]> list = new ArrayList<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      list.add(new String[]{keyValues[i], keyValues[i + 1]});
    }
    return list;
  }

  private static boolean repeated(Map<String, String[]> params, String name) {
    String[] values = params.get(name);
    return values != null && values.length > 1;
  }

  private static String one(Map<String, String[]> params, String name) {
    String[] values = params.get(name);
    return values == null || values.length == 0 ? null : values[0];
  }
}
