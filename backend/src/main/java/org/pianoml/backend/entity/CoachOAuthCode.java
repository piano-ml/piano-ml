package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An authorization code (coach OAuth, issue #414, docs/coach-oauth-design.md 2.3): 60 seconds, single use, bound
 * to everything the token request must repeat. Only the hash of the code is stored.
 */
@Entity
@Table(name = "coach_oauth_code", schema = "pianoml")
@Data
public class CoachOAuthCode {

  @Id
  @Column(name = "code_hash", length = 64)
  private String codeHash;

  @Column(name = "client_id", nullable = false, length = 500)
  private String clientId;

  @Column(name = "redirect_uri", nullable = false, length = 500)
  private String redirectUri;

  @Column(name = "code_challenge", nullable = false, length = 128)
  private String codeChallenge;

  /** Space-separated, as granted by the user. */
  @Column(nullable = false, length = 200)
  private String scopes;

  @Column(nullable = false, length = 500)
  private String resource;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;

  @Column(name = "used_at")
  private OffsetDateTime usedAt;

  @Column(name = "grant_id")
  private UUID grantId;
}
