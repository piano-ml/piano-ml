package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An access grant for an external AI tool (coach, issue #414): the user allows the client {@code name} to use
 * {@code scopes} until {@code expiresAt}. Its token authenticates on /mcp/** only. The secret is never stored:
 * {@code secretHash} is the hex SHA-256 of the 32 secret bytes.
 */
@Entity
@Table(name = "coach_grant", schema = "pianoml")
@Data
public class CoachGrant {

  public static final String KIND_PAT = "pat";
  public static final String KIND_OAUTH = "oauth";

  @Id
  private UUID id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 80)
  private String name;

  @Column(nullable = false, length = 16)
  private String kind;

  @Column(name = "secret_hash", nullable = false, length = 64)
  private String secretHash;

  /** Space-separated scopes, for example "practice:read scores:read". */
  @Column(nullable = false, length = 200)
  private String scopes;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;

  @Column(name = "last_used_at")
  private OffsetDateTime lastUsedAt;

  @Column(name = "revoked_at")
  private OffsetDateTime revokedAt;
}
