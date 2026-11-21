package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An OAuth access or refresh token of the coach (issue #414, docs/coach-oauth-design.md 2.4). Only the hash of the
 * token is stored. A token never outlives its grant: revoking the grant kills its tokens at once.
 */
@Entity
@Table(name = "coach_oauth_token", schema = "pianoml")
@Data
public class CoachOAuthToken {

  public static final String KIND_ACCESS = "access";
  public static final String KIND_REFRESH = "refresh";

  @Id
  @Column(name = "token_hash", length = 64)
  private String tokenHash;

  @Column(name = "grant_id", nullable = false)
  private UUID grantId;

  @Column(nullable = false, length = 8)
  private String kind;

  @Column(name = "client_id", nullable = false, length = 500)
  private String clientId;

  @Column(nullable = false, length = 500)
  private String resource;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;

  @Column(name = "used_at")
  private OffsetDateTime usedAt;
}
