package org.pianoml.backend.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.DefaultCsrfToken;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Stores the CSRF token in a JS-readable {@code XSRF-TOKEN} cookie (double-submit pattern for the SPA).
 *
 * <p>In production the SPA (pianoml.org) and the API (api.pianoml.org) are different origins, so the cookie
 * must carry {@code Domain=pianoml.org} (covers every subdomain) for the frontend to read it and echo it in {@code X-XSRF-TOKEN}.
 * Same rule as the login cookie in AccountController: shared domain when the request comes from a pianoml.org
 * origin, or reaches a pianoml.org host without an Origin (a page opened on the API, an image, a download link);
 * host-only otherwise (localhost dev, through the /api proxy or direct).
 *
 * <p>A host-only cookie on api.pianoml.org is never readable by the SPA, yet the browser sends it with the shared
 * one, under the same name. Older versions issued it on requests without an Origin: when it came first, every
 * request of the SPA failed with CSRF_TOKEN_INVALID. Hence {@link #loadToken} picks the cookie the request
 * echoes, and {@link #expireStaleHostOnlyCookie} removes the host-only one from such browsers.
 */
public class OriginAwareCsrfTokenRepository implements CsrfTokenRepository {

  /**
   * No leading dot: Tomcat's RFC 6265 cookie processor rejects ".pianoml.org" (IllegalArgumentException, so every
   * request from a pianoml.org origin failed with 500). Browsers treat "pianoml.org" exactly like the dotted form:
   * the cookie is sent to pianoml.org and every subdomain.
   */
  public static final String SHARED_COOKIE_DOMAIN = "pianoml.org";

  static final String COOKIE_NAME = "XSRF-TOKEN";
  static final String HEADER_NAME = "X-XSRF-TOKEN";

  private final CookieCsrfTokenRepository hostOnly = CookieCsrfTokenRepository.withHttpOnlyFalse();
  private final CookieCsrfTokenRepository shared = CookieCsrfTokenRepository.withHttpOnlyFalse();

  public OriginAwareCsrfTokenRepository() {
    shared.setCookieCustomizer(cookie -> cookie.domain(SHARED_COOKIE_DOMAIN));
  }

  static boolean isPianomlOrigin(String origin) {
    return origin != null && origin.contains("pianoml.org");
  }

  /** Whether the request reached a pianoml.org host (api.pianoml.org in production; not localhost). */
  static boolean isPianomlHost(HttpServletRequest request) {
    String host = request.getServerName();
    if (host == null) {
      return false;
    }
    String lower = host.toLowerCase(Locale.ROOT);
    return lower.equals(SHARED_COOKIE_DOMAIN) || lower.endsWith("." + SHARED_COOKIE_DOMAIN);
  }

  private CookieCsrfTokenRepository forRequest(HttpServletRequest request) {
    String origin = request.getHeader("Origin");
    boolean shared = origin == null ? isPianomlHost(request) : isPianomlOrigin(origin);
    return shared ? this.shared : hostOnly;
  }

  @Override
  public CsrfToken generateToken(HttpServletRequest request) {
    return hostOnly.generateToken(request);
  }

  @Override
  public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
    forRequest(request).saveToken(token, request, response);
  }

  /**
   * The token of the XSRF-TOKEN cookie (browsers do not send its Domain back). With several such cookies, the one
   * the request echoes in X-XSRF-TOKEN: only pages of the allowed origins can set that header, so this accepts
   * nothing a forged request could produce.
   */
  @Override
  public CsrfToken loadToken(HttpServletRequest request) {
    CsrfToken first = hostOnly.loadToken(request);
    String echoed = request.getHeader(HEADER_NAME);
    if (first == null || echoed == null || echoed.equals(first.getToken())) {
      return first;
    }
    return xsrfCookies(request).stream()
      .filter(echoed::equals)
      .findFirst()
      .<CsrfToken>map(value -> new DefaultCsrfToken(first.getHeaderName(), first.getParameterName(), value))
      .orElse(first);
  }

  /**
   * On a pianoml.org host, a request with several XSRF-TOKEN cookies carries a stale host-only one (see the class
   * comment): expires it (no Domain attribute, so the shared cookie stays). Always Secure: pianoml.org is served
   * over HTTPS only, and a browser ignores a non-Secure cookie that would overwrite a Secure one.
   */
  public static void expireStaleHostOnlyCookie(HttpServletRequest request, HttpServletResponse response) {
    if (isPianomlHost(request) && xsrfCookies(request).size() > 1) {
      ResponseCookie expired = ResponseCookie.from(COOKIE_NAME, "").path("/").maxAge(0).secure(true).build();
      response.addHeader(HttpHeaders.SET_COOKIE, expired.toString());
    }
  }

  private static List<String> xsrfCookies(HttpServletRequest request) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) {
      return List.of();
    }
    return Arrays.stream(cookies).filter(c -> COOKIE_NAME.equals(c.getName())).map(Cookie::getValue).toList();
  }
}
