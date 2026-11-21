package org.pianoml.backend.service;

import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.ErrorReport;
import org.pianoml.backend.exception.EntityNotFoundException;
import org.pianoml.backend.model.ErrorReportCreate;
import org.pianoml.backend.model.ErrorReportDetail;
import org.pianoml.backend.model.ErrorReportLevel;
import org.pianoml.backend.model.ErrorReportPage;
import org.pianoml.backend.model.ErrorReportSource;
import org.pianoml.backend.model.ErrorReportSummary;
import org.pianoml.backend.repository.ErrorReportRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.Period;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.pianoml.backend.service.ErrorReportSanitizer.*;

/**
 * Error reports (issue #408): records the backend's own unhandled errors and the browser's, lets admins
 * browse and delete them, and deletes them after {@code errors.retention} (3 months).
 * <p>
 * Recording never breaks the response being sent: backend errors are saved on a background thread (outside
 * the failing request's transaction, which may be rolling back), and any failure there is only logged.
 */
@Slf4j
@Service
public class ErrorReportService {

  /** Request attribute set once the request's error is recorded, so the fallback filter does not record it twice */
  public static final String REPORTED_ATTRIBUTE = ErrorReportService.class.getName() + ".reported";

  private static final String SUMMARY_COLUMNS =
    "id, created_at, source, level, message, exception_type, url, http_method, http_status, fingerprint";

  private final ErrorReportRepository repository;
  private final NamedParameterJdbcTemplate jdbc;
  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final Period retention;
  private final String backendRelease;

  /** Bounded: under an error storm, reports beyond the queue are dropped rather than piling up in memory */
  private final ExecutorService writer = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
    new ArrayBlockingQueue<>(200), runnable -> {
      Thread thread = new Thread(runnable, "error-report-writer");
      thread.setDaemon(true);
      return thread;
    }, new ThreadPoolExecutor.DiscardPolicy());

  /** Day of the last purge on this instance: the purge also runs on ingestion, at most once a day */
  private final AtomicReference<LocalDate> lastPurge = new AtomicReference<>(LocalDate.MIN);

  public ErrorReportService(ErrorReportRepository repository, NamedParameterJdbcTemplate jdbc,
                            ObjectMapper objectMapper, Clock clock,
                            @Value("${errors.retention:P3M}") Period retention,
                            @Value("${errors.release:}") String backendRelease) {
    this.repository = repository;
    this.jdbc = jdbc;
    this.objectMapper = objectMapper;
    this.clock = clock;
    this.retention = retention;
    this.backendRelease = backendRelease == null || backendRelease.isBlank() ? null : truncate(backendRelease, MAX_RELEASE);
  }

  @PreDestroy
  void shutdown() {
    writer.shutdown();
  }

  // --- capture -------------------------------------------------------------------------------------------------

  /**
   * Records a backend error answered with {@code status} (5xx). Never throws. {@code error} may be null when
   * only the status is known.
   */
  public void recordBackend(Throwable error, HttpServletRequest request, int status) {
    try {
      if (request.getAttribute(REPORTED_ATTRIBUTE) != null) {
        return;
      }
      request.setAttribute(REPORTED_ATTRIBUTE, Boolean.TRUE);
      // Read everything from the request now: it is recycled once the response is sent
      ErrorReport report = new ErrorReport();
      report.setCreatedAt(now());
      report.setSource(ErrorReport.SOURCE_BACKEND);
      report.setLevel(ErrorReport.LEVEL_ERROR);
      String url = requestUrl(request);
      report.setUrl(sanitizeUrl(url));
      report.setHttpMethod(request.getMethod());
      report.setHttpStatus(status);
      report.setUserAgent(truncate(request.getHeader("User-Agent"), MAX_USER_AGENT));
      report.setRelease(backendRelease);
      report.setUserId(currentUserId());
      if (error != null) {
        report.setMessage(truncate(error.getMessage(), MAX_MESSAGE));
        report.setExceptionType(truncate(error.getClass().getName(), MAX_EXCEPTION_TYPE));
        report.setStackTrace(truncate(stackTrace(error), MAX_STACK_TRACE));
        report.setFingerprint(fingerprint(error, url));
      } else {
        report.setMessage("HTTP " + status);
        report.setFingerprint(fingerprint(status, request.getMethod(), url));
      }
      writer.execute(() -> save(report));
    } catch (RejectedExecutionException e) {
      log.debug("Error report dropped: writer shut down");
    } catch (RuntimeException e) {
      log.warn("Could not record an error report", e);
    }
  }

  private void save(ErrorReport report) {
    try {
      repository.save(report);
      purgeIfDue();
    } catch (RuntimeException e) {
      log.warn("Could not save an error report: {}", e.toString());
    }
  }

  /**
   * A report pushed by the browser: source, time, user and user agent come from the server, not the body.
   * Reports from crawlers are dropped: older bundles cached by crawlers still send them.
   */
  public void ingest(ErrorReportCreate body, HttpServletRequest request) {
    String url = body.getUrl();
    if (url == null || url.isBlank()) {
      throw new IllegalArgumentException("url is required");
    }
    if (CrawlerUserAgents.isCrawler(request.getHeader("User-Agent"))) {
      return;
    }
    ErrorReport report = new ErrorReport();
    report.setCreatedAt(now());
    report.setSource(ErrorReport.SOURCE_FRONTEND);
    report.setLevel(body.getLevel() == null ? ErrorReport.LEVEL_ERROR : body.getLevel().getValue());
    report.setUrl(sanitizeUrl(url));
    report.setMessage(truncate(body.getMessage(), MAX_MESSAGE));
    report.setExceptionType(truncate(body.getExceptionType(), MAX_EXCEPTION_TYPE));
    report.setStackTrace(truncate(body.getStackTrace(), MAX_STACK_TRACE));
    report.setRelease(truncate(body.getRelease(), MAX_RELEASE));
    report.setUserAgent(truncate(request.getHeader("User-Agent"), MAX_USER_AGENT));
    report.setUserId(currentUserId());
    report.setContext(contextJson(body.getContext()));
    report.setFingerprint(fingerprint(body.getExceptionType(), body.getMessage(), body.getStackTrace(), url));
    repository.save(report);
    purgeIfDue();
  }

  private String contextJson(Map<String, Object> context) {
    if (context == null || context.isEmpty()) {
      return null;
    }
    String json = objectMapper.writeValueAsString(context);
    if (json.length() > MAX_CONTEXT) {
      return "{\"_dropped\":\"context over 8 KB\"}";
    }
    return json;
  }

  // --- retention -----------------------------------------------------------------------------------------------

  /** Deletes the reports older than the retention period; returns how many. */
  public int purge() {
    lastPurge.set(LocalDate.now(clock));
    int deleted = repository.deleteOlderThan(now().minus(retention));
    if (deleted > 0) {
      log.info("Error reports: {} older than {} deleted", deleted, retention);
    }
    return deleted;
  }

  /**
   * The scheduler may never fire on an instance that scales to zero: the first report of the day purges too.
   */
  void purgeIfDue() {
    LocalDate today = LocalDate.now(clock);
    LocalDate last = lastPurge.get();
    if (last.isBefore(today) && lastPurge.compareAndSet(last, today)) {
      try {
        purge();
      } catch (RuntimeException e) {
        log.warn("Error report purge failed: {}", e.toString());
      }
    }
  }

  // --- browse --------------------------------------------------------------------------------------------------

  public ErrorReportPage search(ErrorReportSource source, ErrorReportLevel level, OffsetDateTime from,
                                OffsetDateTime to, String q, String fingerprint, boolean grouped,
                                int offset, int limit) {
    MapSqlParameterSource params = new MapSqlParameterSource()
      .addValue("limit", limit)
      .addValue("offset", offset);
    List<String> where = new ArrayList<>();
    if (source != null) {
      where.add("source = :source");
      params.addValue("source", source.getValue());
    }
    if (level != null) {
      where.add("level = :level");
      params.addValue("level", level.getValue());
    }
    if (from != null) {
      where.add("created_at >= :from");
      params.addValue("from", from);
    }
    if (to != null) {
      where.add("created_at < :to");
      params.addValue("to", to);
    }
    if (q != null && !q.isBlank()) {
      where.add("(LOWER(message) LIKE :q ESCAPE '\\' OR LOWER(url) LIKE :q ESCAPE '\\')");
      params.addValue("q", "%" + likeEscape(q.strip().toLowerCase(Locale.ROOT)) + "%");
    }
    if (fingerprint != null && !fingerprint.isBlank()) {
      where.add("fingerprint = :fingerprint");
      params.addValue("fingerprint", fingerprint);
    }
    String filter = where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where);

    long total;
    List<ErrorReportSummary> items;
    if (grouped) {
      total = jdbc.queryForObject("SELECT COUNT(DISTINCT fingerprint) FROM pianoml.error_report" + filter, params, Long.class);
      items = jdbc.query("""
          WITH f AS (SELECT * FROM pianoml.error_report%s),
          g AS (SELECT fingerprint AS g_fingerprint, COUNT(*) AS g_count, MIN(created_at) AS g_first, MAX(created_at) AS g_last
                FROM f GROUP BY fingerprint),
          l AS (SELECT f.*, ROW_NUMBER() OVER (PARTITION BY fingerprint ORDER BY created_at DESC, id) AS rn FROM f)
          SELECT %s, g_count, g_first, g_last FROM l JOIN g ON g.g_fingerprint = l.fingerprint
          WHERE rn = 1 ORDER BY g_last DESC, id LIMIT :limit OFFSET :offset
          """.formatted(filter, SUMMARY_COLUMNS), params, (rs, i) -> summary(rs)
        .count(rs.getLong("g_count"))
        .firstSeen(offsetDateTime(rs, "g_first"))
        .lastSeen(offsetDateTime(rs, "g_last")));
    } else {
      total = jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.error_report" + filter, params, Long.class);
      items = jdbc.query("SELECT " + SUMMARY_COLUMNS + " FROM pianoml.error_report" + filter
        + " ORDER BY created_at DESC, id LIMIT :limit OFFSET :offset", params, (rs, i) -> summary(rs));
    }
    return new ErrorReportPage(items, total, offset, limit);
  }

  private static String likeEscape(String value) {
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }

  private ErrorReportSummary summary(ResultSet rs) throws SQLException {
    ErrorReportSummary summary = new ErrorReportSummary(rs.getObject("id", UUID.class),
      offsetDateTime(rs, "created_at"), ErrorReportSource.fromValue(rs.getString("source")),
      ErrorReportLevel.fromValue(rs.getString("level")), rs.getString("url"), rs.getString("fingerprint"));
    summary.setMessage(rs.getString("message"));
    summary.setExceptionType(rs.getString("exception_type"));
    summary.setHttpMethod(rs.getString("http_method"));
    int status = rs.getInt("http_status");
    summary.setHttpStatus(rs.wasNull() ? null : status);
    return summary;
  }

  private static OffsetDateTime offsetDateTime(ResultSet rs, String column) throws SQLException {
    OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
    return value == null ? null : value.withOffsetSameInstant(ZoneOffset.UTC);
  }

  /** The report in full, with how often and since when its fingerprint occurs. */
  public ErrorReportDetail detail(UUID id) {
    ErrorReport report = repository.findById(id)
      .orElseThrow(() -> new EntityNotFoundException("Error report not found: " + id));
    ErrorReportDetail detail = new ErrorReportDetail(report.getId(), report.getCreatedAt().withOffsetSameInstant(ZoneOffset.UTC),
      ErrorReportSource.fromValue(report.getSource()), ErrorReportLevel.fromValue(report.getLevel()),
      report.getUrl(), report.getFingerprint());
    detail.setMessage(report.getMessage());
    detail.setExceptionType(report.getExceptionType());
    detail.setHttpMethod(report.getHttpMethod());
    detail.setHttpStatus(report.getHttpStatus());
    detail.setStackTrace(report.getStackTrace());
    detail.setUserAgent(report.getUserAgent());
    detail.setRelease(report.getRelease());
    detail.setUserId(report.getUserId());
    detail.setContext(parseContext(report.getContext()));
    jdbc.query("SELECT COUNT(*) AS n, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen"
        + " FROM pianoml.error_report WHERE fingerprint = :fingerprint",
      new MapSqlParameterSource("fingerprint", report.getFingerprint()), rs -> {
        detail.setCount(rs.getLong("n"));
        detail.setFirstSeen(offsetDateTime(rs, "first_seen"));
        detail.setLastSeen(offsetDateTime(rs, "last_seen"));
      });
    return detail;
  }

  private Map<String, Object> parseContext(String json) {
    if (json == null) {
      return null;
    }
    try {
      return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
      });
    } catch (RuntimeException e) {
      return Map.of("_raw", json);
    }
  }

  public void delete(UUID id) {
    repository.deleteById(id);
  }

  public long deleteFingerprint(String fingerprint) {
    return repository.deleteByFingerprint(fingerprint);
  }

  // --- helpers -------------------------------------------------------------------------------------------------

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock);
  }

  private static String requestUrl(HttpServletRequest request) {
    StringBuilder url = new StringBuilder(request.getRequestURL());
    if (request.getQueryString() != null) {
      url.append('?').append(request.getQueryString());
    }
    return url.toString();
  }

  private static String stackTrace(Throwable error) {
    StringWriter out = new StringWriter();
    error.printStackTrace(new PrintWriter(out));
    return out.toString();
  }

  /** The logged-in user's id (the JWT subject), never their email. */
  private static UUID currentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || authentication instanceof AnonymousAuthenticationToken || !authentication.isAuthenticated()) {
      return null;
    }
    try {
      return UUID.fromString(authentication.getName());
    } catch (IllegalArgumentException e) {
      return null;
    }
  }
}
