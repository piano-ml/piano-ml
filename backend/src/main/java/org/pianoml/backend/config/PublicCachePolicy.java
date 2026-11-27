package org.pianoml.backend.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * The GET endpoints whose response is the same for every visitor, and how long caches may keep it.
 * <p>
 * Every other response keeps Spring Security's default ("no-cache, no-store"), and the XSRF-TOKEN cookie is not
 * issued on these (CsrfCookieFilter): a shared cache must never store a Set-Cookie, and Angular's HTTP transfer
 * cache (SSR) skips such responses. An endpoint whose result depends on the user (search, browse: they include
 * the user's own private scores) must never be listed here.
 * <p>
 * Scores and their videos are edited by their owner: they may be stored but are revalidated on every use
 * (max-age=0 with an ETag, PublicCacheEtagFilter), so an edit shows at once. Stats, keys and genres change
 * slowly and are kept a few minutes.
 */
public final class PublicCachePolicy {

  private static final CacheControl REVALIDATED = CacheControl.maxAge(Duration.ZERO).cachePublic().mustRevalidate();
  private static final CacheControl FEW_MINUTES = CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic();

  private record Rule(Predicate<String> path, CacheControl cacheControl) {
  }

  /** One rule per endpoint, as paths of the API (OpenAPI spec). The first match wins. */
  private static final List<Rule> RULES = List.of(
    new Rule("/genre"::equals, FEW_MINUTES),
    new Rule("/score/stats"::equals, FEW_MINUTES),
    new Rule("/score/getFullKey"::equals, FEW_MINUTES),
    // The score's video lessons
    new Rule(Pattern.compile("^/score/[^/]+/video$").asMatchPredicate(), REVALIDATED),
    // A score by its slug; /score/search shares the shape but depends on the user
    new Rule(Pattern.compile("^/score/(?!search$)[^/]+$").asMatchPredicate(), REVALIDATED)
  );

  private PublicCachePolicy() {
  }

  /** The Cache-Control of a public GET endpoint, empty for every other request. */
  public static Optional<CacheControl> cacheControl(String method, String path) {
    if (!"GET".equals(method) || path == null) {
      return Optional.empty();
    }
    return RULES.stream().filter(rule -> rule.path().test(path)).map(Rule::cacheControl).findFirst();
  }

  public static Optional<CacheControl> cacheControl(HttpServletRequest request) {
    return cacheControl(request.getMethod(), pathOf(request));
  }

  public static boolean isPublic(HttpServletRequest request) {
    return cacheControl(request).isPresent();
  }

  /** The path inside the application (no context path). */
  private static String pathOf(HttpServletRequest request) {
    String uri = request.getRequestURI();
    String context = request.getContextPath();
    return context != null && !context.isEmpty() && uri.startsWith(context) ? uri.substring(context.length()) : uri;
  }
}
