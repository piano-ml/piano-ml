package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * An OAuth client of the coach (issue #414, docs/coach-oauth-design.md 2.2): a public client, identified by a
 * client metadata document URL ({@link #KIND_CIMD}, the row caches the document) or registered dynamically
 * ({@link #KIND_DCR}). No secret.
 */
@Entity
@Table(name = "coach_oauth_client", schema = "pianoml")
@Data
public class CoachOAuthClient {

  public static final String KIND_CIMD = "cimd";
  public static final String KIND_DCR = "dcr";

  @Id
  @Column(name = "client_id", length = 500)
  private String clientId;

  @Column(nullable = false, length = 8)
  private String kind;

  @Column(name = "client_name", nullable = false, length = 80)
  private String clientName;

  /** A JSON array of strings. */
  @Column(name = "redirect_uris", nullable = false, columnDefinition = "TEXT")
  private String redirectUris;

  @Column(name = "metadata_fetched_at")
  private OffsetDateTime metadataFetchedAt;

  @Column(name = "metadata_expires_at")
  private OffsetDateTime metadataExpiresAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "last_used_at")
  private OffsetDateTime lastUsedAt;
}
