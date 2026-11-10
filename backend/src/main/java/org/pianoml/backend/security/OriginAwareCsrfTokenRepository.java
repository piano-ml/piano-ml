package org.pianoml.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;

/**
 * Stores the CSRF token in a JS-readable {@code XSRF-TOKEN} cookie (double-submit pattern for the SPA).
 *
 * <p>In production the SPA (pianoml.org) and the API (api.pianoml.org) are different origins, so the cookie
 * must carry {@code Domain=.pianoml.org} for the frontend to read it and echo it in {@code X-XSRF-TOKEN}.
 * Same rule as the login cookie in AccountController: shared domain only when the request Origin is a
 * pianoml.org origin; host-only otherwise (localhost dev, through the /api proxy or direct).
 */
public class OriginAwareCsrfTokenRepository implements CsrfTokenRepository {

  public static final String SHARED_COOKIE_DOMAIN = ".pianoml.org";

  private final CookieCsrfTokenRepository hostOnly = CookieCsrfTokenRepository.withHttpOnlyFalse();
  private final CookieCsrfTokenRepository shared = CookieCsrfTokenRepository.withHttpOnlyFalse();

  public OriginAwareCsrfTokenRepository() {
    shared.setCookieCustomizer(cookie -> cookie.domain(SHARED_COOKIE_DOMAIN));
  }

  static boolean isPianomlOrigin(String origin) {
    return origin != null && origin.contains("pianoml.org");
  }

  private CookieCsrfTokenRepository forRequest(HttpServletRequest request) {
    return isPianomlOrigin(request.getHeader("Origin")) ? shared : hostOnly;
  }

  @Override
  public CsrfToken generateToken(HttpServletRequest request) {
    return hostOnly.generateToken(request);
  }

  @Override
  public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
    forRequest(request).saveToken(token, request, response);
  }

  @Override
  public CsrfToken loadToken(HttpServletRequest request) {
    // Reads the XSRF-TOKEN cookie by name; the Domain attribute is not sent back by browsers.
    return hostOnly.loadToken(request);
  }
}
