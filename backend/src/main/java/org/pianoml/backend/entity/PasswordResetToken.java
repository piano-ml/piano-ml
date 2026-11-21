package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A password reset link sent by email, kept as the SHA-256 of its token until used or expired (changeset 031). */
@Entity
@Table(name = "password_reset_token", schema = "pianoml")
@Data
public class PasswordResetToken {

  @Id
  private UUID id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  /** Hex SHA-256 of the token in the link; the token itself is never stored. */
  @Column(name = "token_hash", nullable = false, unique = true, length = 64)
  private String tokenHash;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;
}
