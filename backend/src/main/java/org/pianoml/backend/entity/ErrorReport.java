package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An error seen by the backend or pushed by the browser (issue #408). Deleted after 3 months.
 */
@Entity
@Table(name = "error_report", schema = "pianoml")
@Data
public class ErrorReport {

  public static final String SOURCE_BACKEND = "BACKEND";
  public static final String SOURCE_FRONTEND = "FRONTEND";
  public static final String LEVEL_ERROR = "ERROR";
  public static final String LEVEL_WARNING = "WARNING";

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(nullable = false)
  private String source;

  @Column(nullable = false)
  private String level;

  private String message;

  @Column(name = "exception_type")
  private String exceptionType;

  @Column(name = "stack_trace")
  private String stackTrace;

  /** Browser URL (frontend) or request URL with its query (backend, method in httpMethod); sensitive parameters removed */
  @Column(nullable = false)
  private String url;

  @Column(name = "http_method")
  private String httpMethod;

  @Column(name = "http_status")
  private Integer httpStatus;

  @Column(name = "user_agent")
  private String userAgent;

  @Column(name = "release")
  private String release;

  @Column(name = "user_id")
  private UUID userId;

  @Column(nullable = false)
  private String fingerprint;

  /** JSON object, at most 8 KB */
  private String context;
}
