package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * The client address the unauthenticated OAuth endpoints are rate-limited by (coach, issue #414).
 *
 * <p>Behind {@code coach.client-address.trusted-proxies} proxies that each append the address they saw to
 * {@code X-Forwarded-For}, the client is that many entries from the <em>right</em>: the outermost trusted proxy
 * appended it. The entries to its left come from the client itself and are never used, so a client cannot pick a
 * new address per request to escape a limit (the leftmost entry, which Spring's ForwardedHeaderFilter would use,
 * can be anything). With 0 (the default, for a server reached directly) the header is ignored entirely: anyone
 * could send it. When the header has fewer entries than trusted proxies, or a malformed one, the TCP peer address
 * is used.
 *
 * <p>Too low a count keys every request on a proxy address: one shared limit, never a spoofable one.
 */
@Component
public class ClientAddressResolver {

  private static final Pattern ADDRESS = Pattern.compile("^[0-9A-Fa-f:.]{2,45}$");

  private final int trustedProxies;

  public ClientAddressResolver(@Value("${coach.client-address.trusted-proxies:0}") int trustedProxies) {
    this.trustedProxies = Math.max(0, trustedProxies);
  }

  public String resolve(HttpServletRequest request) {
    String peer = request.getRemoteAddr();
    if (trustedProxies == 0) {
      return peer;
    }
    List<String> entries = new ArrayList<>();
    for (String header : Collections.list(request.getHeaders("X-Forwarded-For"))) {
      for (String part : header.split(",")) {
        String entry = part.strip();
        if (!entry.isEmpty()) {
          entries.add(entry);
        }
      }
    }
    int index = entries.size() - trustedProxies;
    if (index < 0) {
      return peer;
    }
    String client = entries.get(index);
    return ADDRESS.matcher(client).matches() ? client : peer;
  }
}
