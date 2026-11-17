package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A validated authorization request waiting for the user's decision (coach OAuth, issue #414,
 * docs/coach-oauth-design.md 2.3). Keyed by the hash of the random id carried in the consent page URL.
 */
@Entity
@Table(name = "coach_oauth_request", schema = "pianoml")
@Data
public class CoachOAuthRequest {

  @Id
  @Column(name = "id_hash", length = 64)
  private String idHash;

  @Column(name = "client_id", nullable = false, length = 500)
  private String clientId;

  @Column(name = "client_name", nullable = false, length = 80)
  private String clientName;

  /** The metadata URL's host (verified); null for a dynamically registered client. */
  @Column(name = "client_host", length = 255)
  private String clientHost;

  @Column(name = "loopback_only", nullable = false)
  private boolean loopbackOnly;

  @Column(name = "redirect_uri", nullable = false, length = 500)
  private String redirectUri;

  @Column(name = "code_challenge", nullable = false, length = 128)
  private String codeChallenge;

  /** Space-separated. */
  @Column(nullable = false, length = 200)
  private String scopes;

  @Column(nullable = false, length = 500)
  private String resource;

  @Column(length = 500)
  private String state;

  @Column(name = "user_id")
  private UUID userId;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;

  @Column(name = "decided_at")
  private OffsetDateTime decidedAt;
}
