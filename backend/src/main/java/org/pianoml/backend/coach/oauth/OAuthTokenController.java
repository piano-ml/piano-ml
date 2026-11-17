package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Token and revocation endpoints of the coach OAuth server (coach, issue #414; docs/coach-oauth-design.md 2.4):
 * {@code POST /oauth/token} (RFC 6749, grant types authorization_code and refresh_token) and
 * {@code POST /oauth/revoke} (RFC 7009). Public clients: {@code client_id} in the form body, no secret. Form-encoded
 * bodies only. Every answer is {@code Cache-Control: no-store}. 404 while OAuth is off. Hand-written: fixed by the
 * RFCs, never called by the SPA.
 */
@RestController
public class OAuthTokenController {

  private static final Set<String> SINGLE = Set.of("grant_type", "code", "redirect_uri", "client_id", "code_verifier",
    "refresh_token", "resource", "token", "token_type_hint");

  private final CoachOAuthSettings settings;
  private final CoachOAuthTokenService tokens;
  private final FixedWindowLimiter limiter;

  public OAuthTokenController(CoachOAuthSettings settings, CoachOAuthTokenService tokens, Clock clock,
                              @Value("${coach.oauth.token.per-ip-per-minute:120}") int perIpPerMinute) {
    this.settings = settings;
    this.tokens = tokens;
    this.limiter = new FixedWindowLimiter(perIpPerMinute, Duration.ofMinutes(1), clock);
  }

  @PostMapping(path = "/oauth/token", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> token(HttpServletRequest request) {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    ResponseEntity<Map<String, Object>> refused = checkRequest(request);
    if (refused != null) {
      return refused;
    }
    String grantType = request.getParameter("grant_type");
    try {
      CoachOAuthTokenService.Issued issued = switch (grantType == null ? "" : grantType) {
        case "authorization_code" -> tokens.exchangeCode(request.getParameter("code"), request.getParameter("client_id"),
          request.getParameter("redirect_uri"), request.getParameter("code_verifier"), request.getParameter("resource"));
        case "refresh_token" -> tokens.refresh(request.getParameter("refresh_token"), request.getParameter("client_id"),
          request.getParameter("resource"));
        case "" -> throw new CoachOAuthTokenService.TokenException("invalid_request", "grant_type is required.");
        default -> throw new CoachOAuthTokenService.TokenException("unsupported_grant_type",
          "Supported: authorization_code, refresh_token.");
      };
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("access_token", issued.accessToken());
      body.put("token_type", "Bearer");
      body.put("expires_in", issued.expiresIn());
      body.put("refresh_token", issued.refreshToken());
      body.put("scope", issued.scope());
      return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(body);
    } catch (CoachOAuthTokenService.TokenException e) {
      return error(HttpStatus.BAD_REQUEST, e.error(), e.getMessage());
    }
  }

  @PostMapping(path = "/oauth/revoke", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> revoke(HttpServletRequest request) {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    ResponseEntity<Map<String, Object>> refused = checkRequest(request);
    if (refused != null) {
      return refused;
    }
    if (request.getParameter("token") == null) {
      return error(HttpStatus.BAD_REQUEST, "invalid_request", "token is required.");
    }
    tokens.revoke(request.getParameter("token"), request.getParameter("client_id"));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).build(); // also for unknown tokens (RFC 7009 2.2)
  }

  /** Rate limit, form encoding, no repeated parameter (RFC 6749 3.2). Null when the request may go on. */
  private ResponseEntity<Map<String, Object>> checkRequest(HttpServletRequest request) {
    if (!limiter.tryAcquire(request.getRemoteAddr())) {
      return error(HttpStatus.TOO_MANY_REQUESTS, "temporarily_unavailable", "Too many requests. Try again later.");
    }
    String type = request.getContentType();
    if (type == null || !MediaType.APPLICATION_FORM_URLENCODED.isCompatibleWith(MediaType.parseMediaType(type))) {
      return error(HttpStatus.BAD_REQUEST, "invalid_request", "The body must be application/x-www-form-urlencoded.");
    }
    if (request.getQueryString() != null && !request.getQueryString().isEmpty()) {
      return error(HttpStatus.BAD_REQUEST, "invalid_request", "Parameters go in the body, not the URL.");
    }
    for (String name : SINGLE) {
      String[] values = request.getParameterValues(name);
      if (values != null && values.length > 1) {
        return error(HttpStatus.BAD_REQUEST, "invalid_request", name + " is repeated.");
      }
    }
    return null;
  }

  private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String error, String description) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("error", error);
    body.put("error_description", description);
    return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(body);
  }
}
