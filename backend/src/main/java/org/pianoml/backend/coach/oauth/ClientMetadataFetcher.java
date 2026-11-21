package org.pianoml.backend.coach.oauth;

import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.SystemDefaultDnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.Header;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.util.Timeout;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fetches client metadata documents (coach, issue #414; SSRF guard of docs/coach-oauth-design.md 2.2).
 *
 * <p>Any client id URL is accepted (open trust policy), so the server fetches URLs chosen by strangers. Rules:
 * HTTPS on the default port only; every address the host resolves to must be public ({@link PublicAddresses}),
 * checked inside the HTTP client's own DNS resolver, so the connection goes to an address that was checked
 * (no DNS rebinding between check and use); no redirect followed; no proxy, cookie or retry; a deadline and a
 * size limit on the whole response.
 */
public class ClientMetadataFetcher implements AutoCloseable {

  /** What may be fetched. {@link #PRODUCTION} everywhere but in tests of the fetcher itself. */
  public record Rules(boolean httpsOnly, boolean defaultPortOnly, Predicate<InetAddress> addressAllowed,
                      Duration timeout, int maxBytes) {

    public static final Rules PRODUCTION =
      new Rules(true, true, PublicAddresses::isPublic, Duration.ofSeconds(5), 16 * 1024);
  }

  /** The document's body, and how long it may be cached ({@code null} when the server did not say). */
  public record Fetched(String body, Duration maxAge) {
  }

  private static final Pattern MAX_AGE = Pattern.compile("(?:^|[,\\s])max-age\\s*=\\s*\"?(\\d{1,10})\"?");

  private final Rules rules;
  private final CloseableHttpClient http;

  public ClientMetadataFetcher(Rules rules) {
    this.rules = rules;
    Timeout timeout = Timeout.of(rules.timeout());
    DnsResolver guarded = new SystemDefaultDnsResolver() {
      @Override
      public InetAddress[] resolve(String host) throws UnknownHostException {
        InetAddress[] addresses = super.resolve(host);
        for (InetAddress address : addresses) {
          if (!rules.addressAllowed().test(address)) {
            throw new UnknownHostException(host + " resolves to a non-public address");
          }
        }
        return addresses;
      }
    };
    this.http = HttpClients.custom()
      .setConnectionManager(PoolingHttpClientConnectionManagerBuilder.create()
        .setDnsResolver(guarded)
        .setDefaultConnectionConfig(ConnectionConfig.custom().setConnectTimeout(timeout).setSocketTimeout(timeout).build())
        .setMaxConnTotal(20)
        .build())
      .setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(timeout).setConnectionRequestTimeout(timeout).build())
      .disableRedirectHandling()
      .disableCookieManagement()
      .disableAuthCaching()
      .disableAutomaticRetries()
      .setUserAgent("PianoML-OAuth/1.0")
      .build();
  }

  public Fetched fetch(URI url) throws ClientMetadataException {
    check(url);
    HttpGet get = new HttpGet(url);
    get.addHeader("Accept", "application/json");
    long deadline = System.nanoTime() + rules.timeout().toNanos();
    try {
      return http.execute(get, response -> {
        if (response.getCode() != 200) {
          throw new IOException("HTTP " + response.getCode()); // a redirect too: never followed
        }
        HttpEntity entity = response.getEntity();
        if (entity == null) {
          throw new IOException("empty response");
        }
        if (entity.getContentLength() > rules.maxBytes()) {
          throw new IOException("larger than " + rules.maxBytes() + " bytes");
        }
        String body = read(entity.getContent(), deadline);
        Header cacheControl = response.getFirstHeader("Cache-Control");
        return new Fetched(body, maxAge(cacheControl == null ? null : cacheControl.getValue()));
      });
    } catch (UnknownHostException e) {
      throw new ClientMetadataException("cannot fetch " + url + ": " + e.getMessage());
    } catch (IOException e) {
      throw new ClientMetadataException("cannot fetch " + url + ": " + e.getMessage());
    }
  }

  private void check(URI url) throws ClientMetadataException {
    String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase(Locale.ROOT);
    if (rules.httpsOnly() ? !"https".equals(scheme) : !("https".equals(scheme) || "http".equals(scheme))) {
      throw new ClientMetadataException("not an HTTPS URL: " + url);
    }
    if (url.getHost() == null || url.getRawUserInfo() != null) {
      throw new ClientMetadataException("not a usable URL: " + url);
    }
    if (rules.defaultPortOnly() && url.getPort() != -1 && url.getPort() != 443) {
      throw new ClientMetadataException("only port 443 is allowed: " + url);
    }
  }

  private String read(InputStream in, long deadline) throws IOException {
    try (in) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buffer = new byte[4096];
      int n;
      while ((n = in.read(buffer)) != -1) {
        out.write(buffer, 0, n);
        if (out.size() > rules.maxBytes()) {
          throw new IOException("larger than " + rules.maxBytes() + " bytes");
        }
        if (System.nanoTime() > deadline) {
          throw new IOException("too slow");
        }
      }
      return out.toString(StandardCharsets.UTF_8);
    }
  }

  /** {@code max-age} of a Cache-Control value; zero for no-store or no-cache; {@code null} when absent. */
  static Duration maxAge(String cacheControl) {
    if (cacheControl == null) {
      return null;
    }
    String value = cacheControl.toLowerCase(Locale.ROOT);
    if (value.contains("no-store") || value.contains("no-cache")) {
      return Duration.ZERO;
    }
    Matcher m = MAX_AGE.matcher(value);
    return m.find() ? Duration.ofSeconds(Long.parseLong(m.group(1))) : null;
  }

  @Override
  public void close() throws IOException {
    http.close();
  }
}
