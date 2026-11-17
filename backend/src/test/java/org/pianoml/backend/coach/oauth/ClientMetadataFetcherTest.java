package org.pianoml.backend.coach.oauth;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The fetcher's rules. Network behavior (redirects, size, deadline) runs against a local server with loopback
 * and plain HTTP allowed; the production rules are checked on what they refuse before any connection.
 */
class ClientMetadataFetcherTest {

  private HttpServer server;
  private ClientMetadataFetcher local;

  @BeforeEach
  void start() throws Exception {
    server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    server.createContext("/ok", ex -> reply(ex, 200, "{\"a\":1}", "public, max-age=600"));
    server.createContext("/nocache", ex -> reply(ex, 200, "{}", "no-store"));
    server.createContext("/redirect", ex -> {
      ex.getResponseHeaders().add("Location", "/ok");
      reply(ex, 302, "", null);
    });
    server.createContext("/big", ex -> reply(ex, 200, "x".repeat(20_000), null));
    server.createContext("/slow", ex -> {
      try {
        Thread.sleep(1500);
      } catch (InterruptedException ignored) {
        Thread.currentThread().interrupt();
      }
      reply(ex, 200, "{}", null);
    });
    server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool()); // /slow must not block the others
    server.start();
    local = new ClientMetadataFetcher(
      new ClientMetadataFetcher.Rules(false, false, a -> true, Duration.ofMillis(700), 16 * 1024));
  }

  @AfterEach
  void stop() throws Exception {
    local.close();
    server.stop(0);
  }

  private static void reply(com.sun.net.httpserver.HttpExchange ex, int status, String body, String cacheControl)
    throws java.io.IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    if (cacheControl != null) {
      ex.getResponseHeaders().add("Cache-Control", cacheControl);
    }
    ex.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
    if (bytes.length > 0) {
      try (OutputStream out = ex.getResponseBody()) {
        out.write(bytes);
      }
    }
    ex.close();
  }

  private URI url(String path) {
    return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + path);
  }

  @Test
  void fetchesTheBody_andTheCacheLifetime() throws Exception {
    ClientMetadataFetcher.Fetched fetched = local.fetch(url("/ok"));
    assertThat(fetched.body()).isEqualTo("{\"a\":1}");
    assertThat(fetched.maxAge()).isEqualTo(Duration.ofMinutes(10));
    assertThat(local.fetch(url("/nocache")).maxAge()).isEqualTo(Duration.ZERO);
  }

  @Test
  void neverFollowsARedirect() {
    assertThatThrownBy(() -> local.fetch(url("/redirect"))).isInstanceOf(ClientMetadataException.class)
      .hasMessageContaining("HTTP 302");
  }

  @Test
  void refusesAnOversizeDocument_andASlowServer_andAMissingOne() {
    assertThatThrownBy(() -> local.fetch(url("/big"))).hasMessageContaining("larger than");
    assertThatThrownBy(() -> local.fetch(url("/slow"))).isInstanceOf(ClientMetadataException.class);
    assertThatThrownBy(() -> local.fetch(url("/missing"))).hasMessageContaining("HTTP 404");
  }

  @Test
  void productionRules_refuseHttp_otherPorts_andNonPublicAddresses_evenAfterDnsResolution() throws Exception {
    try (ClientMetadataFetcher production = new ClientMetadataFetcher(ClientMetadataFetcher.Rules.PRODUCTION)) {
      assertThatThrownBy(() -> production.fetch(URI.create("http://client.example/meta"))).hasMessageContaining("not an HTTPS URL");
      assertThatThrownBy(() -> production.fetch(URI.create("https://client.example:8443/meta"))).hasMessageContaining("port 443");
      assertThatThrownBy(() -> production.fetch(URI.create("https://user@client.example/meta"))).hasMessageContaining("not a usable URL");
      for (String host : new String[]{"localhost", "127.0.0.1", "2130706433", "169.254.169.254", "10.0.0.1", "[::1]"}) {
        assertThatThrownBy(() -> production.fetch(URI.create("https://" + host + "/meta")))
          .as(host).isInstanceOf(ClientMetadataException.class).hasMessageContaining("non-public");
      }
    }
  }

  @Test
  void maxAge_parsing() {
    assertThat(ClientMetadataFetcher.maxAge(null)).isNull();
    assertThat(ClientMetadataFetcher.maxAge("public")).isNull();
    assertThat(ClientMetadataFetcher.maxAge("public, max-age=86400")).isEqualTo(Duration.ofDays(1));
    assertThat(ClientMetadataFetcher.maxAge("s-maxage=10, max-age=\"60\"")).isEqualTo(Duration.ofMinutes(1));
    assertThat(ClientMetadataFetcher.maxAge("no-cache, max-age=600")).isEqualTo(Duration.ZERO);
  }
}
