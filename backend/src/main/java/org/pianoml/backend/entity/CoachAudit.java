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

/** One MCP tool call of the coach (issue #414): never the argument values. */
@Entity
@Table(name = "coach_audit", schema = "pianoml")
@Data
public class CoachAudit {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private OffsetDateTime at;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "grant_id", nullable = false)
  private UUID grantId;

  @Column(nullable = false, length = 40)
  private String tool;

  /** "OK" or the error code of the result. */
  @Column(nullable = false, length = 32)
  private String outcome;

  @Column(name = "duration_ms", nullable = false)
  private int durationMs;
}
