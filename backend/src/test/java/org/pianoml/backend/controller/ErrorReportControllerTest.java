package org.pianoml.backend.controller;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.pianoml.backend.config.ErrorReportConfig;
import org.pianoml.backend.entity.ErrorReport;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.ErrorReportRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.ErrorReportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Error reports end to end (issue #408): backend capture, browser ingestion (validation, CSRF exemption,
 * rate limit), admin-only browsing and the retention purge. Rows of each test carry a unique marker in
 * their URL, since other tests may record reports in the same database.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ErrorReportControllerTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private ErrorReportRepository errorReportRepository;
  @Autowired private ErrorReportService errorReportService;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private ApplicationContext context;

  private String marker;
  private final List<UUID> createdUsers = new ArrayList<>();

  @BeforeEach
  void marker() {
    marker = "m" + UUID.randomUUID().toString().replace("-", "");
  }

  @AfterEach
  void cleanup() {
    jdbc.update("DELETE FROM pianoml.error_report WHERE url LIKE ?", "%" + marker + "%");
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", userId);
    }
  }

  private User newUser(String roles) {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("reporter-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles(roles);
    user.setVerified(true);
    User saved = userRepository.save(user);
    createdUsers.add(saved.getId());
    return saved;
  }

  private String bearer(User user) {
    return "Bearer " + jwtTokenProvider.generateToken(user);
  }

  private List<Map<String, Object>> rows() {
    return jdbc.queryForList("SELECT * FROM pianoml.error_report WHERE url LIKE ? ORDER BY created_at", "%" + marker + "%");
  }

  /** Backend reports are saved on a background thread. */
  private List<Map<String, Object>> awaitRows(int count) throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      List<Map<String, Object>> rows = rows();
      if (rows.size() >= count) {
        return rows;
      }
      Thread.sleep(50);
    }
    return rows();
  }

  /** A browser report from its own address, so that tests do not share the rate limit. */
  private MockHttpServletRequestBuilder report(String json) {
    return report(json, "10.%d.%d.%d".formatted(Math.floorMod(marker.hashCode(), 250), Math.floorMod(marker.hashCode() >> 8, 250),
      Math.floorMod(marker.hashCode() >> 16, 250)));
  }

  /** The last X-Forwarded-For entry is the client address; earlier ones are client-supplied and ignored. */
  private MockHttpServletRequestBuilder report(String json, String ip) {
    return report(json, ip, "Mozilla/5.0 (Test)");
  }

  private MockHttpServletRequestBuilder report(String json, String ip, String userAgent) {
    return post("/error-report")
      .contentType(MediaType.APPLICATION_JSON)
      .header("X-Forwarded-For", "203.0.113.9, " + ip)
      .header("User-Agent", userAgent)
      .content(json);
  }

  private String reportJson() {
    return """
      {"url": "https://pianoml.org/score/abc?%s=1&token=secret", "message": "x is undefined",
       "exceptionType": "TypeError", "stackTrace": "TypeError: x\\n    at f (https://pianoml.org/main-ABCDEFGH.js:1:2)",
       "level": "WARNING", "release": "abc123", "context": {"route": "/score/:slug", "status": 0},
       "source": "BACKEND", "userId": "%s", "createdAt": "2001-01-01T00:00:00Z", "userAgent": "forged"}
      """.formatted(marker, UUID.randomUUID());
  }

  // --- backend capture -----------------------------------------------------------------------------------------

  @Test
  void unhandledExceptionIsRecordedAsBackendReport() throws Exception {
    User user = newUser("USER");
    mockMvc.perform(get("/test-only/error-report/boom?m=" + marker + "&password=hunter2")
        .header("Authorization", bearer(user)))
      .andExpect(status().isInternalServerError());

    List<Map<String, Object>> rows = awaitRows(1);
    assertThat(rows).hasSize(1);
    Map<String, Object> row = rows.getFirst();
    assertThat(row.get("source")).isEqualTo("BACKEND");
    assertThat(row.get("level")).isEqualTo("ERROR");
    assertThat(row.get("http_method")).isEqualTo("GET");
    assertThat(row.get("http_status")).isEqualTo(500);
    assertThat(row.get("exception_type")).isEqualTo(IllegalStateException.class.getName());
    assertThat(row.get("message")).isEqualTo("kaboom from the test controller");
    assertThat((String) row.get("stack_trace")).contains("ErrorReportTestController.boom");
    assertThat((String) row.get("url")).endsWith("/test-only/error-report/boom?m=" + marker).doesNotContain("hunter2");
    assertThat(row.get("user_id")).isEqualTo(user.getId());
    assertThat((String) row.get("fingerprint")).hasSize(64);
  }

  @Test
  void fiveHundredsWithoutExceptionAreRecordedByTheFallback() throws Exception {
    mockMvc.perform(get("/test-only/error-report/unavailable?m=" + marker))
      .andExpect(status().isServiceUnavailable());

    List<Map<String, Object>> rows = awaitRows(1);
    assertThat(rows).hasSize(1);
    assertThat(rows.getFirst().get("http_status")).isEqualTo(503);
    assertThat(rows.getFirst().get("message")).isEqualTo("HTTP 503");
  }

  @Test
  void expectedClientErrorsAreNotRecorded() throws Exception {
    mockMvc.perform(get("/test-only/error-report/bad-request?m=" + marker)).andExpect(status().isBadRequest());
    mockMvc.perform(get("/admin/error-report?m=" + marker)).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/score/" + UUID.randomUUID() + "?m=" + marker)).andExpect(status().is4xxClientError());
    // A 500 afterwards is recorded: by then the earlier ones would have been saved too
    mockMvc.perform(get("/test-only/error-report/boom?m=" + marker)).andExpect(status().isInternalServerError());

    List<Map<String, Object>> rows = awaitRows(1);
    Thread.sleep(200);
    assertThat(rows()).hasSize(1);
    assertThat(rows.getFirst().get("http_status")).isEqualTo(500);
  }

  // --- ingestion -----------------------------------------------------------------------------------------------

  @Test
  void anonymousBrowserReportIsAcceptedAndServerFieldsWin() throws Exception {
    mockMvc.perform(report(reportJson())).andExpect(status().isAccepted());

    List<Map<String, Object>> rows = rows();
    assertThat(rows).hasSize(1);
    Map<String, Object> row = rows.getFirst();
    assertThat(row.get("source")).isEqualTo("FRONTEND");
    assertThat(row.get("level")).isEqualTo("WARNING");
    assertThat(row.get("user_id")).isNull();
    assertThat(row.get("user_agent")).isEqualTo("Mozilla/5.0 (Test)");
    assertThat(row.get("release")).isEqualTo("abc123");
    assertThat(((OffsetDateTime) jdbc.queryForObject("SELECT created_at FROM pianoml.error_report WHERE url LIKE ?",
      OffsetDateTime.class, "%" + marker + "%")).getYear()).isGreaterThan(2001);
    assertThat(row.get("url")).isEqualTo("https://pianoml.org/score/abc?" + marker + "=1");
    assertThat((String) row.get("context")).contains("\"route\":\"/score/:slug\"");
  }

  @Test
  void reportsFromCrawlersAreAcceptedButNotStored() throws Exception {
    mockMvc.perform(report(reportJson(), "10.250.0.1",
        "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) "
          + "Chrome/157.0.8103.78 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"))
      .andExpect(status().isAccepted());

    assertThat(rows()).isEmpty();
  }

  @Test
  void loggedInReportCarriesTheUserAndNeedsNoCsrfToken() throws Exception {
    User user = newUser("USER");
    // The session cookie alone, no X-XSRF-TOKEN header: what navigator.sendBeacon sends
    mockMvc.perform(report(reportJson()).cookie(new Cookie("Authorization", jwtTokenProvider.generateToken(user))))
      .andExpect(status().isAccepted());

    assertThat(rows()).singleElement().satisfies(row -> assertThat(row.get("user_id")).isEqualTo(user.getId()));
  }

  @Test
  void invalidReportsAreRejected() throws Exception {
    mockMvc.perform(report("{\"message\": \"no url " + marker + "\"}")).andExpect(status().isBadRequest());
    mockMvc.perform(report("{\"url\": \"\", \"message\": \"" + marker + "\"}")).andExpect(status().isBadRequest());
    mockMvc.perform(report("{\"url\": \"   \", \"message\": \"" + marker + "\"}")).andExpect(status().isBadRequest());
    mockMvc.perform(report("{\"url\": \"/" + marker + "\", \"message\": \"" + "x".repeat(10_001) + "\"}"))
      .andExpect(status().isBadRequest());
    mockMvc.perform(report("{\"url\": \"/" + marker + "\", \"message\": \"m\", \"level\": \"FATAL\"}"))
      .andExpect(status().isBadRequest());
    assertThat(rows()).isEmpty();
  }

  @Test
  void longFieldsAreTruncatedAndBigContextDropped() throws Exception {
    mockMvc.perform(report("""
        {"url": "/%s", "message": "%s", "stackTrace": "%s", "context": {"blob": "%s"}}
        """.formatted(marker, "m".repeat(5000), "s".repeat(90_000), "c".repeat(9000))))
      .andExpect(status().isAccepted());

    Map<String, Object> row = rows().getFirst();
    assertThat((String) row.get("message")).hasSize(2048);
    assertThat((String) row.get("stack_trace")).hasSize(32 * 1024);
    assertThat(row.get("context")).isEqualTo("{\"_dropped\":\"context over 8 KB\"}");
  }

  @Test
  void reportsAreRateLimitedPerAddress() throws Exception {
    String body = "{\"url\": \"/" + marker + "\", \"message\": \"loop\"}";
    for (int i = 0; i < 30; i++) {
      mockMvc.perform(report(body, "198.51.100.77")).andExpect(status().isAccepted());
    }
    mockMvc.perform(report(body, "198.51.100.77"))
      .andExpect(status().isTooManyRequests());
    // Another address is not affected
    mockMvc.perform(report(body, "198.51.100.78")).andExpect(status().isAccepted());
    assertThat(rows()).hasSize(31);
  }

  // --- admin access --------------------------------------------------------------------------------------------

  private MockHttpServletRequestBuilder adminRequest(String endpoint, UUID id) {
    return switch (endpoint) {
      case "list" -> get("/admin/error-report");
      case "detail" -> get("/admin/error-report/" + id);
      case "delete" -> delete("/admin/error-report/" + id);
      case "deleteFingerprint" -> delete("/admin/error-report").param("fingerprint", marker);
      default -> throw new IllegalArgumentException(endpoint);
    };
  }

  @ParameterizedTest
  @ValueSource(strings = {"list", "detail", "delete", "deleteFingerprint"})
  void adminEndpointsAreAdminOnly(String endpoint) throws Exception {
    UUID id = save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, marker, 0).getId();

    // Anonymous: an invalid token authenticates nobody (and, as a header, passes CSRF like a script would;
    // csrf() is not used: it swaps the CSRF repository of the shared test context, see CsrfProtectionTest)
    mockMvc.perform(adminRequest(endpoint, id).header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
    mockMvc.perform(adminRequest(endpoint, id).header("Authorization", bearer(newUser("USER"))))
      .andExpect(status().isForbidden());
    mockMvc.perform(adminRequest(endpoint, id).header("Authorization", bearer(newUser("USER,ADMIN"))))
      .andExpect(status().is2xxSuccessful());
  }

  // --- admin browse --------------------------------------------------------------------------------------------

  private ErrorReport save(String source, String level, String fingerprint, int daysAgo) {
    ErrorReport report = new ErrorReport();
    report.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC).minusDays(daysAgo));
    report.setSource(source);
    report.setLevel(level);
    report.setUrl("https://pianoml.org/" + marker + "/" + fingerprint);
    report.setMessage("message of " + fingerprint);
    report.setFingerprint(fingerprint);
    report.setContext("{\"route\":\"/x\"}");
    return errorReportRepository.save(report);
  }

  @Test
  void listFiltersAndGroupsByFingerprint() throws Exception {
    String admin = bearer(newUser("ADMIN"));
    String a = marker + "a";
    String b = marker + "b";
    save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, a, 3);
    save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, a, 2);
    ErrorReport latestA = save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_WARNING, a, 1);
    save(ErrorReport.SOURCE_BACKEND, ErrorReport.LEVEL_ERROR, b, 5);

    mockMvc.perform(get("/admin/error-report").param("q", marker.toUpperCase()).header("Authorization", admin))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.total", is(4)))
      .andExpect(jsonPath("$.items", hasSize(4)))
      .andExpect(jsonPath("$.items[0].id", is(latestA.getId().toString())))
      .andExpect(jsonPath("$.items[0].count").doesNotExist());

    mockMvc.perform(get("/admin/error-report").param("q", marker).param("grouped", "true").header("Authorization", admin))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.total", is(2)))
      .andExpect(jsonPath("$.items[0].fingerprint", is(a)))
      .andExpect(jsonPath("$.items[0].id", is(latestA.getId().toString())))
      .andExpect(jsonPath("$.items[0].count", is(3)))
      .andExpect(jsonPath("$.items[1].fingerprint", is(b)))
      .andExpect(jsonPath("$.items[1].count", is(1)));

    mockMvc.perform(get("/admin/error-report").param("q", marker).param("source", "BACKEND").header("Authorization", admin))
      .andExpect(jsonPath("$.total", is(1)))
      .andExpect(jsonPath("$.items[0].fingerprint", is(b)));
    mockMvc.perform(get("/admin/error-report").param("q", marker).param("level", "WARNING").header("Authorization", admin))
      .andExpect(jsonPath("$.total", is(1)));
    mockMvc.perform(get("/admin/error-report").param("fingerprint", a).param("from", OffsetDateTime.now(ZoneOffset.UTC).minusDays(2).minusHours(1).toString())
        .header("Authorization", admin))
      .andExpect(jsonPath("$.total", is(2)));
    mockMvc.perform(get("/admin/error-report").param("q", marker).param("limit", "1").param("offset", "1").header("Authorization", admin))
      .andExpect(jsonPath("$.total", is(4)))
      .andExpect(jsonPath("$.items", hasSize(1)))
      .andExpect(jsonPath("$.limit", is(1)));
    // LIKE wildcards in q are literal
    mockMvc.perform(get("/admin/error-report").param("q", marker + "%").header("Authorization", admin))
      .andExpect(jsonPath("$.total", is(0)));
    mockMvc.perform(get("/admin/error-report").param("limit", "500").header("Authorization", admin))
      .andExpect(status().isBadRequest());
  }

  @Test
  void detailShowsTheWholeReportAndItsOccurrences() throws Exception {
    String admin = bearer(newUser("ADMIN"));
    String fp = marker + "d";
    save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, fp, 4);
    ErrorReport latest = save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, fp, 1);

    mockMvc.perform(get("/admin/error-report/" + latest.getId()).header("Authorization", admin))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.url", is(latest.getUrl())))
      .andExpect(jsonPath("$.context.route", is("/x")))
      .andExpect(jsonPath("$.count", is(2)))
      .andExpect(jsonPath("$.firstSeen").exists())
      .andExpect(jsonPath("$.lastSeen").exists());
    mockMvc.perform(get("/admin/error-report/" + UUID.randomUUID()).header("Authorization", admin))
      .andExpect(status().isNotFound());
  }

  @Test
  void deleteOneOrAFingerprint() throws Exception {
    String admin = bearer(newUser("ADMIN"));
    String fp = marker + "x";
    ErrorReport one = save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, fp, 1);
    save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, fp, 1);
    save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, fp, 1);
    save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, marker + "y", 1);

    mockMvc.perform(delete("/admin/error-report/" + one.getId()).header("Authorization", admin))
      .andExpect(status().isNoContent());
    mockMvc.perform(delete("/admin/error-report/" + one.getId()).header("Authorization", admin))
      .andExpect(status().isNoContent());
    mockMvc.perform(delete("/admin/error-report").param("fingerprint", fp).header("Authorization", admin))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.deleted", is(2)));
    mockMvc.perform(delete("/admin/error-report").header("Authorization", admin))
      .andExpect(status().isBadRequest());
    assertThat(rows()).hasSize(1);
  }

  // --- retention -----------------------------------------------------------------------------------------------

  @Test
  void purgeDeletesReportsOlderThanThreeMonths() {
    save(ErrorReport.SOURCE_FRONTEND, ErrorReport.LEVEL_ERROR, marker + "old", 122);
    save(ErrorReport.SOURCE_BACKEND, ErrorReport.LEVEL_ERROR, marker + "recent", 30);

    assertThat(errorReportService.purge()).isGreaterThanOrEqualTo(1);

    assertThat(rows()).singleElement().satisfies(row -> assertThat(row.get("fingerprint")).isEqualTo(marker + "recent"));
  }

  @Test
  void retentionJobIsScheduled() {
    assertThat(context.getBean(ErrorReportConfig.ErrorReportRetention.class)).isNotNull();
  }
}
