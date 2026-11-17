package org.pianoml.backend.coach.oauth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.CoachOAuthClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Client identification (coach, issue #414, phase O2): metadata documents, their cache, and the cleanup. */
@SpringBootTest
class CoachOAuthClientServiceTest {

  @Autowired private CoachOAuthClientService clients;
  @Autowired private JdbcTemplate jdbc;
  @MockitoBean private ClientMetadataFetcher fetcher;

  private final ObjectMapper json = new ObjectMapper();
  private final String run = UUID.randomUUID().toString().substring(0, 8);

  @AfterEach
  void cleanup() {
    jdbc.update("DELETE FROM pianoml.coach_oauth_client WHERE client_id LIKE ? OR client_name LIKE ?",
      "%" + run + "%", "%" + run + "%");
  }

  private String clientId() {
    return "https://client.example/" + run + "/oauth/metadata.json";
  }

  private void serve(String clientId, Map<String, Object> document, Duration maxAge) throws Exception {
    when(fetcher.fetch(URI.create(clientId)))
      .thenReturn(new ClientMetadataFetcher.Fetched(json.writeValueAsString(document), maxAge));
  }

  private Map<String, Object> document(String clientId) {
    return Map.of(
      "client_id", clientId,
      "client_name", "Test client " + run,
      "redirect_uris", List.of("https://client.example/callback", "http://localhost/callback"),
      "token_endpoint_auth_method", "none");
  }

  @Test
  void aMetadataDocument_fromAnyPublicHost_isAccepted_andCached() throws Exception {
    String id = clientId();
    serve(id, document(id), Duration.ofHours(2));

    CoachOAuthClientService.OAuthClient client = clients.resolve(id).orElseThrow();
    assertThat(client.name()).isEqualTo("Test client " + run);
    assertThat(client.kind()).isEqualTo(CoachOAuthClient.KIND_CIMD);
    assertThat(client.verifiedHost()).contains("client.example");
    assertThat(client.allowsRedirect("https://client.example/callback")).isTrue();
    assertThat(client.allowsRedirect("http://localhost:4321/callback")).isTrue();
    assertThat(client.allowsRedirect("https://client.example/other")).isFalse();
    assertThat(client.onlyLoopbackRedirects()).isFalse();

    clients.resolve(id);
    verify(fetcher, times(1)).fetch(any());
    // the cache lasts what the server said
    assertThat(ttl(id)).isEqualTo(Duration.ofHours(2));
  }

  @Test
  void aStaleCache_isRefetched_andUpdated_keepingTheRow() throws Exception {
    String id = clientId();
    serve(id, document(id), null);
    clients.resolve(id);
    clients.markUsed(id);
    jdbc.update("UPDATE pianoml.coach_oauth_client SET metadata_expires_at = ? WHERE client_id = ?",
      java.time.OffsetDateTime.now().minusMinutes(1), id);

    Map<String, Object> renamed = new java.util.HashMap<>(document(id));
    renamed.put("client_name", "Renamed " + run);
    serve(id, renamed, Duration.ofDays(30));
    assertThat(clients.resolve(id).orElseThrow().name()).isEqualTo("Renamed " + run);
    verify(fetcher, times(2)).fetch(any());
    assertThat(jdbc.queryForObject("SELECT last_used_at FROM pianoml.coach_oauth_client WHERE client_id = ?",
      java.sql.Timestamp.class, id)).isNotNull();
    assertThat(ttl(id)).isEqualTo(Duration.ofHours(24)); // capped
  }

  @Test
  void cacheLifetime_isBetweenFiveMinutesAndADay_oneHourByDefault() throws Exception {
    for (Object[] c : new Object[][]{{Duration.ZERO, Duration.ofMinutes(5)}, {null, Duration.ofHours(1)},
      {Duration.ofDays(7), Duration.ofDays(1)}}) {
      String id = "https://client.example/" + run + "/" + ((Duration) c[1]).toMinutes() + "/meta";
      serve(id, document(id), (Duration) c[0]);
      clients.resolve(id);
      assertThat(ttl(id)).as(String.valueOf(c[0])).isEqualTo(c[1]);
    }
  }

  @Test
  void badDocuments_areRefused_andNotCached() throws Exception {
    String id = clientId();
    Map<String, Map<String, Object>> cases = new java.util.LinkedHashMap<>();
    cases.put("client_id is not its own URL", with(id, "client_id", "https://other.example/meta"));
    cases.put("no client_name", without(id, "client_name"));
    cases.put("redirect_uris", without(id, "redirect_uris"));
    cases.put("plain HTTP redirect", with(id, "redirect_uris", List.of("http://client.example/cb")));
    cases.put("custom scheme", with(id, "redirect_uris", List.of("myapp://cb")));
    cases.put("secret", with(id, "client_secret", "s3cret"));
    cases.put("confidential", with(id, "token_endpoint_auth_method", "client_secret_basic"));
    for (var c : cases.entrySet()) {
      serve(id, c.getValue(), null);
      assertThatThrownBy(() -> clients.resolve(id)).as(c.getKey()).isInstanceOf(ClientMetadataException.class);
    }
    when(fetcher.fetch(URI.create(id))).thenReturn(new ClientMetadataFetcher.Fetched("not json", null));
    assertThatThrownBy(() -> clients.resolve(id)).isInstanceOf(ClientMetadataException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_oauth_client WHERE client_id = ?", Long.class, id)).isZero();
  }

  @Test
  void aClientListingSeveralMethods_isAccepted_whenNoneIsAmongThem() throws Exception {
    String id = clientId();
    Map<String, Object> doc = new java.util.HashMap<>(document(id));
    doc.put("token_endpoint_auth_method", "private_key_jwt");
    doc.put("token_endpoint_auth_methods_supported", List.of("private_key_jwt", "none"));
    serve(id, doc, null);
    assertThat(clients.resolve(id)).isPresent();
  }

  @Test
  void badClientIdUrls_areRefused_withoutFetching() throws Exception {
    for (String id : List.of("http://client.example/meta", "https://client.example", "https://client.example/",
      "https://client.example/a/../meta", "https://client.example/meta#x", "https://u@client.example/meta")) {
      assertThatThrownBy(() -> clients.resolve(id)).as(id).isInstanceOf(ClientMetadataException.class);
    }
    verify(fetcher, never()).fetch(any());
    assertThat(clients.resolve("pmc_unknown")).isEmpty();
    assertThat(clients.resolve("")).isEmpty();
  }

  @Test
  void cleanup_deletesClientsNeverUsedForADay_andUnusedForNinetyDays() {
    java.time.OffsetDateTime now = java.time.OffsetDateTime.now();
    insert("dcr-new-" + run, now.minusHours(23), null);
    insert("dcr-old-" + run, now.minusHours(25), null);
    insert("used-recent-" + run, now.minusDays(200), now.minusDays(89));
    insert("used-long-ago-" + run, now.minusDays(200), now.minusDays(91));
    clients.purgeStale();
    assertThat(jdbc.queryForList("SELECT client_id FROM pianoml.coach_oauth_client WHERE client_id LIKE ? ORDER BY client_id",
      String.class, "%" + run))
      .containsExactly("dcr-new-" + run, "used-recent-" + run);
  }

  private Duration ttl(String id) {
    Map<String, Object> row = jdbc.queryForMap("SELECT metadata_fetched_at, metadata_expires_at FROM pianoml.coach_oauth_client "
      + "WHERE client_id = ?", id);
    return Duration.between(instant(row.get("metadata_fetched_at")), instant(row.get("metadata_expires_at")));
  }

  private static java.time.Instant instant(Object value) {
    if (value instanceof java.time.OffsetDateTime o) {
      return o.toInstant();
    }
    return ((java.sql.Timestamp) value).toInstant();
  }

  private void insert(String id, java.time.OffsetDateTime createdAt, java.time.OffsetDateTime lastUsedAt) {
    jdbc.update("INSERT INTO pianoml.coach_oauth_client (client_id, kind, client_name, redirect_uris, created_at, last_used_at) "
      + "VALUES (?, 'dcr', 'x', '[]', ?, ?)", id, createdAt, lastUsedAt);
  }

  private Map<String, Object> with(String id, String key, Object value) {
    Map<String, Object> doc = new java.util.HashMap<>(document(id));
    doc.put(key, value);
    return doc;
  }

  private Map<String, Object> without(String id, String key) {
    Map<String, Object> doc = new java.util.HashMap<>(document(id));
    doc.remove(key);
    return doc;
  }
}
