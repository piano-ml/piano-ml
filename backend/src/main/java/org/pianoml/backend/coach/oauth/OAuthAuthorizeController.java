package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

/**
 * {@code GET /oauth/authorize} of the coach OAuth server (issue #414, docs/coach-oauth-design.md 2.3): the page an
 * MCP client opens in the user's browser. Reads no cookie (the OAuth chain): it validates, stores the request and
 * redirects to the SPA consent page, or back to the client with an error, or shows an error page when the client
 * or its redirect URI cannot be trusted. 404 while OAuth is off. Hand-written: fixed by RFC 6749, never called by
 * the SPA.
 */
@RestController
public class OAuthAuthorizeController {

  private static final String PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";

  private final CoachOAuthSettings settings;
  private final CoachOAuthAuthorizationService authorization;
  private final FixedWindowLimiter limiter;
  private final ClientAddressResolver addresses;

  /**
   * Unauthenticated and able to make the server fetch a metadata URL and store a request, so limited per client
   * address ({@code coach.oauth.authorize.per-ip-per-minute}, 30 by default: a person connects a few applications,
   * not dozens a minute). Failed metadata URLs are also not refetched for 5 minutes (CoachOAuthClientService).
   */
  public OAuthAuthorizeController(CoachOAuthSettings settings, CoachOAuthAuthorizationService authorization,
                                  java.time.Clock clock,
                                  @org.springframework.beans.factory.annotation.Value("${coach.oauth.authorize.per-ip-per-minute:30}") int perIpPerMinute,
                                  ClientAddressResolver addresses) {
    this.settings = settings;
    this.authorization = authorization;
    this.addresses = addresses;
    this.limiter = new FixedWindowLimiter(perIpPerMinute, java.time.Duration.ofMinutes(1), clock);
  }

  @GetMapping("/oauth/authorize")
  public ResponseEntity<String> authorize(HttpServletRequest request) {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    if (!limiter.tryAcquire(addresses.resolve(request))) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .contentType(new MediaType(MediaType.TEXT_HTML, java.nio.charset.StandardCharsets.UTF_8))
        .header("Content-Security-Policy", PAGE_CSP)
        .header("Retry-After", "60")
        .cacheControl(CacheControl.noStore())
        .body(page("Too many sign-in attempts from your network. Wait a minute and try again."));
    }
    CoachOAuthAuthorizationService.Outcome outcome = authorization.authorize(request.getParameterMap());
    if (outcome instanceof CoachOAuthAuthorizationService.Outcome.Redirect redirect) {
      return ResponseEntity.status(HttpStatus.FOUND)
        .header(HttpHeaders.LOCATION, redirect.url())
        .header("Referrer-Policy", "no-referrer")
        .cacheControl(CacheControl.noStore())
        .build();
    }
    String message = ((CoachOAuthAuthorizationService.Outcome.ErrorPage) outcome).message();
    return ResponseEntity.badRequest()
      .contentType(new MediaType(MediaType.TEXT_HTML, java.nio.charset.StandardCharsets.UTF_8))
      .header("Content-Security-Policy", PAGE_CSP)
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer")
      .cacheControl(CacheControl.noStore())
      .body(page(message));
  }

  /** A minimal page in English: what went wrong, and what to do. The message is escaped. */
  static String page(String message) {
    return """
      <!doctype html>
      <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="robots" content="noindex"><title>PianoML: sign-in link not valid</title>
      <style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#222}
      @media (prefers-color-scheme:dark){body{background:#111;color:#ddd}a{color:#8ab4f8}}</style></head>
      <body><h1>This sign-in link cannot be used</h1><p>%s</p>
      <p>Go back to your application and connect PianoML again. If it keeps failing, the application may not be
      set up for PianoML.</p><p><a href="https://www.pianoml.org/">PianoML</a></p></body></html>
      """.formatted(HtmlUtils.htmlEscape(message));
  }
}
