package org.pianoml.backend.coach.oauth;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.CoachOAuthClient;
import org.pianoml.backend.repository.CoachOAuthClientRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URISyntaxException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * OAuth clients of the coach (issue #414, docs/coach-oauth-design.md 2.2): public clients only, identified by a
 * client metadata document (CIMD) or registered dynamically (DCR, RFC 7591).
 *
 * <p>CIMD: a client id that is an HTTPS URL is fetched ({@link ClientMetadataFetcher}, SSRF-guarded), checked, and
 * cached in {@code coach_oauth_client} for its Cache-Control max-age, between 5 minutes and 24 hours (1 hour when
 * the server says nothing). Any URL is accepted: the consent page shows its host, and the user judges.
 */
@Slf4j
@Service
public class CoachOAuthClientService {

  public static final int MAX_REDIRECT_URIS = 5;
  public static final int MAX_NAME_LENGTH = 80;
  public static final int MAX_CLIENT_ID_LENGTH = 500;
  static final String DCR_PREFIX = "pmc_";
  static final String UNNAMED = "Unnamed application";
  static final Duration MIN_CACHE = Duration.ofMinutes(5);
  static final Duration DEFAULT_CACHE = Duration.ofHours(1);
  static final Duration MAX_CACHE = Duration.ofHours(24);
  /** A client that never completed an authorization is deleted after this. */
  static final Duration KEEP_NEVER_USED = Duration.ofHours(24);
  /** A client not used for this long is deleted. */
  static final Duration KEEP_UNUSED = Duration.ofDays(90);

  private static final Set<String> GRANT_TYPES = Set.of("authorization_code", "refresh_token");

  /** A client, as the authorization endpoint and the consent page need it. */
  public record OAuthClient(String clientId, String kind, String name, List<String> redirectUris) {

    /** The host to show the user: the client id URL's host for CIMD, nothing to vouch for with DCR. */
    public Optional<String> verifiedHost() {
      return CoachOAuthClient.KIND_CIMD.equals(kind) ? Optional.of(URI.create(clientId).getHost()) : Optional.empty();
    }

    public boolean onlyLoopbackRedirects() {
      return redirectUris.stream().allMatch(RedirectUris::isLoopback);
    }

    public boolean allowsRedirect(String requested) {
      return RedirectUris.matches(redirectUris, requested);
    }
  }

  /** A refused registration: an RFC 7591 error code and a description. */
  public static class RegistrationException extends RuntimeException {
    private final String error;

    public RegistrationException(String error, String description) {
      super(description);
      this.error = error;
    }

    public String error() {
      return error;
    }
  }

  private final CoachOAuthClientRepository repository;
  private final ClientMetadataFetcher fetcher;
  private final Clock clock;
  private final ObjectMapper json = new ObjectMapper();
  private final SecureRandom random = new SecureRandom();

  public CoachOAuthClientService(CoachOAuthClientRepository repository, ClientMetadataFetcher fetcher, Clock clock) {
    this.repository = repository;
    this.fetcher = fetcher;
    this.clock = clock;
  }

  /**
   * The client with this id: a cached or freshly fetched metadata document for a URL, a registered client
   * otherwise. Empty for an unknown registered id.
   *
   * @throws ClientMetadataException when a URL client id or its document cannot be used
   */
  public Optional<OAuthClient> resolve(String clientId) throws ClientMetadataException {
    if (clientId == null || clientId.isEmpty() || clientId.length() > MAX_CLIENT_ID_LENGTH) {
      return Optional.empty();
    }
    if (!isUrl(clientId)) {
      return repository.findById(clientId).filter(c -> CoachOAuthClient.KIND_DCR.equals(c.getKind())).map(this::toClient);
    }
    URI url = checkClientIdUrl(clientId);
    OffsetDateTime now = OffsetDateTime.now(clock);
    Optional<CoachOAuthClient> cached = repository.findById(clientId)
      .filter(c -> CoachOAuthClient.KIND_CIMD.equals(c.getKind()))
      .filter(c -> c.getMetadataExpiresAt() != null && c.getMetadataExpiresAt().isAfter(now));
    if (cached.isPresent()) {
      return cached.map(this::toClient);
    }
    ClientMetadataFetcher.Fetched fetched = fetcher.fetch(url);
    Document document = parseDocument(clientId, fetched.body());
    storeMetadata(clientId, document, now, now.plus(cacheFor(fetched.maxAge())));
    return Optional.of(new OAuthClient(clientId, CoachOAuthClient.KIND_CIMD, document.name(), document.redirectUris()));
  }

  /** Records that the client completed an authorization: it is then kept 90 days after its last use. */
  public void markUsed(String clientId) {
    repository.markUsed(clientId, OffsetDateTime.now(clock));
  }

  /**
   * Registers a public client (RFC 7591). Missing optional fields get their defaults; a missing
   * token_endpoint_auth_method is taken as "none", the only one supported (the response says so).
   *
   * @throws RegistrationException {@code invalid_redirect_uri} or {@code invalid_client_metadata}
   */
  public OAuthClient register(JsonNode request) {
    if (request == null || !request.isObject()) {
      throw new RegistrationException("invalid_client_metadata", "The request body must be a JSON object.");
    }
    List<String> redirectUris = redirectUris(request.get("redirect_uris"), true);
    String method = text(request, "token_endpoint_auth_method", "none");
    if (!"none".equals(method)) {
      throw new RegistrationException("invalid_client_metadata",
        "Only public clients are supported: token_endpoint_auth_method must be \"none\".");
    }
    for (String type : strings(request.get("grant_types"), List.of("authorization_code"), "grant_types")) {
      if (!GRANT_TYPES.contains(type)) {
        throw new RegistrationException("invalid_client_metadata", "Unsupported grant type: " + type);
      }
    }
    List<String> responseTypes = strings(request.get("response_types"), List.of("code"), "response_types");
    if (!responseTypes.equals(List.of("code"))) {
      throw new RegistrationException("invalid_client_metadata", "response_types must be [\"code\"].");
    }
    String name = name(text(request, "client_name", null), "invalid_client_metadata");

    CoachOAuthClient client = new CoachOAuthClient();
    client.setClientId(DCR_PREFIX + HexFormat.of().formatHex(randomBytes(16)));
    client.setKind(CoachOAuthClient.KIND_DCR);
    client.setClientName(name);
    client.setRedirectUris(write(redirectUris));
    client.setCreatedAt(OffsetDateTime.now(clock));
    repository.save(client);
    return toClient(client);
  }

  /** Deletes clients never used for 24 hours, or unused for 90 days. Idempotent. */
  public int purgeStale() {
    OffsetDateTime now = OffsetDateTime.now(clock);
    return repository.deleteStale(now.minus(KEEP_NEVER_USED), now.minus(KEEP_UNUSED));
  }

  // --- client metadata documents ---------------------------------------------------------------------------------

  private record Document(String name, List<String> redirectUris) {
  }

  static boolean isUrl(String clientId) {
    return clientId.regionMatches(true, 0, "https://", 0, 8) || clientId.regionMatches(true, 0, "http://", 0, 7);
  }

  /** The client id URL rules of the CIMD specification: HTTPS, a path, no fragment, no user info, no dot segment. */
  private static URI checkClientIdUrl(String clientId) throws ClientMetadataException {
    URI url;
    try {
      url = new URI(clientId);
    } catch (URISyntaxException e) {
      throw new ClientMetadataException("the client id is not a valid URL");
    }
    String path = url.getRawPath();
    if (!"https".equals(url.getScheme()) || url.getHost() == null || url.getRawFragment() != null
      || url.getRawUserInfo() != null || path == null || path.isEmpty() || "/".equals(path)
      || path.contains("/./") || path.contains("/../") || path.endsWith("/.") || path.endsWith("/..")) {
      throw new ClientMetadataException("the client id must be an HTTPS URL with a path, without fragment or dot segments");
    }
    return url;
  }

/**
   * Caches a fetched document: an update of the existing row (keeping its creation and last use), or a new row.
   * Two instances may fetch the same document at once: the one that loses the insert updates instead.
   */
  private void storeMetadata(String clientId, Document document, OffsetDateTime now, OffsetDateTime expiresAt) {
    String uris = write(document.redirectUris());
    if (repository.updateMetadata(clientId, document.name(), uris, now, expiresAt) > 0) {
      return;
    }
    CoachOAuthClient row = new CoachOAuthClient();
    row.setClientId(clientId);
    row.setKind(CoachOAuthClient.KIND_CIMD);
    row.setClientName(document.name());
    row.setRedirectUris(uris);
    row.setMetadataFetchedAt(now);
    row.setMetadataExpiresAt(expiresAt);
    row.setCreatedAt(now);
    try {
      repository.saveAndFlush(row);
    } catch (DataIntegrityViolationException e) {
      repository.updateMetadata(clientId, document.name(), uris, now, expiresAt);
    }
  }

  private Document parseDocument(String clientId, String body) throws ClientMetadataException {
    JsonNode doc;
    try {
      doc = json.readTree(body);
    } catch (JacksonException e) {
      throw new ClientMetadataException("the client metadata document is not JSON");
    }
    if (doc == null || !doc.isObject()) {
      throw new ClientMetadataException("the client metadata document is not a JSON object");
    }
    if (!clientId.equals(text(doc, "client_id", null))) {
      throw new ClientMetadataException("the document's client_id is not its own URL");
    }
    if (doc.has("client_secret") || doc.has("client_secret_expires_at")) {
      throw new ClientMetadataException("a client metadata document must not hold a secret");
    }
    if (!acceptsNone(doc)) {
      throw new ClientMetadataException("the client must accept token_endpoint_auth_method \"none\"");
    }
    String name;
    List<String> redirects;
    try {
      name = name(text(doc, "client_name", null), "invalid_client_metadata");
      if (name.equals(UNNAMED)) {
        throw new ClientMetadataException("the document has no client_name");
      }
      redirects = redirectUris(doc.get("redirect_uris"), true);
    } catch (RegistrationException e) {
      throw new ClientMetadataException(e.getMessage());
    }
    return new Document(name, redirects);
  }

  /**
   * Whether the client can authenticate as a public client: {@code token_endpoint_auth_method} absent or
   * "none", or "none" among {@code token_endpoint_auth_methods_supported} (ChatGPT lists several and picks from
   * the intersection with the server's).
   */
  private static boolean acceptsNone(JsonNode doc) {
    JsonNode supported = doc.get("token_endpoint_auth_methods_supported");
    if (supported != null && supported.isArray()) {
      for (JsonNode m : supported) {
        if ("none".equals(m.asString())) {
          return true;
        }
      }
    }
    JsonNode method = doc.get("token_endpoint_auth_method");
    return (method == null || method.isNull()) ? supported == null : "none".equals(method.asString());
  }

  private static Duration cacheFor(Duration maxAge) {
    if (maxAge == null) {
      return DEFAULT_CACHE;
    }
    if (maxAge.compareTo(MIN_CACHE) < 0) {
      return MIN_CACHE;
    }
    return maxAge.compareTo(MAX_CACHE) > 0 ? MAX_CACHE : maxAge;
  }

  // --- shared validation -----------------------------------------------------------------------------------------

  private List<String> redirectUris(JsonNode node, boolean required) {
    if (node == null || node.isNull()) {
      if (required) {
        throw new RegistrationException("invalid_redirect_uri", "redirect_uris is required.");
      }
      return List.of();
    }
    if (!node.isArray() || node.isEmpty()) {
      throw new RegistrationException("invalid_redirect_uri", "redirect_uris must be a non-empty array.");
    }
    if (node.size() > MAX_REDIRECT_URIS) {
      throw new RegistrationException("invalid_redirect_uri", "At most " + MAX_REDIRECT_URIS + " redirect URIs.");
    }
    Set<String> uris = new LinkedHashSet<>();
    for (JsonNode item : node) {
      if (!item.isString() || !RedirectUris.isAllowed(item.asString())) {
        throw new RegistrationException("invalid_redirect_uri",
          "Redirect URIs must be HTTPS, or HTTP on localhost, 127.0.0.1 or [::1]: " + item);
      }
      uris.add(item.asString());
    }
    return new ArrayList<>(uris);
  }

  private static List<String> strings(JsonNode node, List<String> fallback, String field) {
    if (node == null || node.isNull()) {
      return fallback;
    }
    if (!node.isArray()) {
      throw new RegistrationException("invalid_client_metadata", field + " must be an array.");
    }
    List<String> values = new ArrayList<>();
    for (JsonNode item : node) {
      values.add(item.asString());
    }
    return values;
  }

  private static String text(JsonNode node, String field, String fallback) {
    JsonNode value = node.get(field);
    return value == null || value.isNull() ? fallback : value.asString();
  }

  /** The display name: trimmed, control characters removed, at most 80 characters; a default when empty. */
  private static String name(String value, String error) {
    if (value == null) {
      return UNNAMED;
    }
    String cleaned = value.replaceAll("\\p{Cntrl}", "").strip();
    if (cleaned.length() > MAX_NAME_LENGTH) {
      throw new RegistrationException(error, "client_name is longer than " + MAX_NAME_LENGTH + " characters.");
    }
    return cleaned.isEmpty() ? UNNAMED : cleaned;
  }

  private OAuthClient toClient(CoachOAuthClient row) {
    return new OAuthClient(row.getClientId(), row.getKind(), row.getClientName(), read(row.getRedirectUris()));
  }

  private String write(List<String> uris) {
    try {
      return json.writeValueAsString(uris);
    } catch (JacksonException e) {
      throw new IllegalStateException(e);
    }
  }

  private List<String> read(String uris) {
    try {
      List<String> list = new ArrayList<>();
      json.readTree(uris).forEach(n -> list.add(n.asString()));
      return list;
    } catch (JacksonException e) {
      log.warn("Unreadable redirect URIs in coach_oauth_client: {}", e.toString());
      return List.of();
    }
  }

  private byte[] randomBytes(int n) {
    byte[] bytes = new byte[n];
    random.nextBytes(bytes);
    return bytes;
  }
}
