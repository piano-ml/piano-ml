package org.pianoml.backend.coach.oauth;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Collection;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Redirect URI rules of the coach OAuth server (issue #414, docs/coach-oauth-design.md 2.2).
 *
 * <p>Allowed: an absolute HTTPS URI on any host, or a plain-HTTP loopback URI ({@code localhost},
 * {@code 127.0.0.1}, {@code [::1]}), as the MCP specification allows; never a fragment or user info, never a
 * custom scheme. Matching is exact, except that a loopback URI matches whatever its port (RFC 8252 7.3; Claude
 * Code uses an ephemeral port on both {@code localhost} and {@code 127.0.0.1}).
 */
public final class RedirectUris {

  public static final int MAX_LENGTH = 500;
  private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]");

  private RedirectUris() {
  }

  public static boolean isAllowed(String value) {
    URI uri = parse(value);
    if (uri == null) {
      return false;
    }
    String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
    return "https".equals(scheme) || ("http".equals(scheme) && isLoopback(uri));
  }

  public static boolean isLoopback(String value) {
    URI uri = parse(value);
    return uri != null && "http".equalsIgnoreCase(uri.getScheme()) && isLoopback(uri);
  }

  /** Whether {@code requested} is one of {@code registered}: exactly, or a registered loopback URI on another port. */
  public static boolean matches(Collection<String> registered, String requested) {
    if (requested == null) {
      return false;
    }
    if (registered.contains(requested)) {
      return true;
    }
    URI wanted = parse(requested);
    if (wanted == null || !"http".equalsIgnoreCase(wanted.getScheme()) || !isLoopback(wanted)) {
      return false;
    }
    for (String candidate : registered) {
      URI uri = parse(candidate);
      if (uri != null && "http".equalsIgnoreCase(uri.getScheme()) && isLoopback(uri)
        && uri.getHost().equalsIgnoreCase(wanted.getHost())
        && Objects.equals(uri.getRawPath(), wanted.getRawPath())
        && Objects.equals(uri.getRawQuery(), wanted.getRawQuery())) {
        return true;
      }
    }
    return false;
  }

  private static boolean isLoopback(URI uri) {
    return LOOPBACK_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT));
  }

  private static URI parse(String value) {
    if (value == null || value.isEmpty() || value.length() > MAX_LENGTH) {
      return null;
    }
    try {
      URI uri = new URI(value);
      if (!uri.isAbsolute() || uri.isOpaque() || uri.getHost() == null || uri.getRawFragment() != null
        || uri.getRawUserInfo() != null) {
        return null;
      }
      return uri;
    } catch (URISyntaxException e) {
      return null;
    }
  }
}
