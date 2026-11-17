package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Dynamic client registration, RFC 7591 (coach, issue #414; docs/coach-oauth-design.md 2.2): open (no initial
 * access token), public clients only. The fallback of hosts that do not use a client metadata document, and the
 * way a user registers by hand a client that does neither. 404 while OAuth is off.
 *
 * <p>Unauthenticated, so limited per client address ({@code coach.oauth.register.per-ip-per-hour}, 60 by default:
 * hosted applications register from a few shared egress addresses). Registered clients that never complete an
 * authorization are deleted after 24 hours. Hand-written: the paths and fields are fixed by the RFC, and the SPA
 * never calls it.
 */
@RestController
public class OAuthRegistrationController {

  static final int MAX_BODY_BYTES = 16 * 1024;

  private final CoachOAuthSettings settings;
  private final CoachOAuthClientService clients;
  private final FixedWindowLimiter limiter;
  private final Clock clock;
  private final ObjectMapper json = new ObjectMapper();

  public OAuthRegistrationController(CoachOAuthSettings settings, CoachOAuthClientService clients, Clock clock,
                                     @Value("${coach.oauth.register.per-ip-per-hour:60}") int perIpPerHour) {
    this.settings = settings;
    this.clients = clients;
    this.limiter = new FixedWindowLimiter(perIpPerHour, Duration.ofHours(1), clock);
    this.clock = clock;
  }

  @PostMapping(path = "/oauth/register", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> register(HttpServletRequest request) throws IOException {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    if (!limiter.tryAcquire(request.getRemoteAddr())) {
      return error(HttpStatus.TOO_MANY_REQUESTS, "temporarily_unavailable", "Too many registrations. Try again later.");
    }
    if (request.getContentType() == null || !MediaType.APPLICATION_JSON.isCompatibleWith(MediaType.parseMediaType(request.getContentType()))) {
      return error(HttpStatus.BAD_REQUEST, "invalid_client_metadata", "The request must be application/json.");
    }
    JsonNode body;
    try {
      body = json.readTree(readLimited(request.getInputStream()));
    } catch (JacksonException | BodyTooLargeException e) {
      return error(HttpStatus.BAD_REQUEST, "invalid_client_metadata", "The request body is not a JSON object of at most 16 KB.");
    }
    try {
      CoachOAuthClientService.OAuthClient client = clients.register(body);
      Map<String, Object> response = new LinkedHashMap<>();
      response.put("client_id", client.clientId());
      response.put("client_id_issued_at", clock.instant().getEpochSecond());
      response.put("client_name", client.name());
      response.put("redirect_uris", client.redirectUris());
      response.put("grant_types", java.util.List.of("authorization_code", "refresh_token"));
      response.put("response_types", java.util.List.of("code"));
      response.put("token_endpoint_auth_method", "none");
      return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(response);
    } catch (CoachOAuthClientService.RegistrationException e) {
      return error(HttpStatus.BAD_REQUEST, e.error(), e.getMessage());
    }
  }

  private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String error, String description) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("error", error);
    body.put("error_description", description);
    return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
  }

  private static class BodyTooLargeException extends Exception {
  }

  private static byte[] readLimited(InputStream in) throws IOException, BodyTooLargeException {
    byte[] bytes = in.readNBytes(MAX_BODY_BYTES + 1);
    if (bytes.length > MAX_BODY_BYTES) {
      throw new BodyTooLargeException();
    }
    return bytes;
  }
}
