package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A tool call for a browser tab, and its result (Remote coach, issue #414). */
@Entity
@Table(name = "coach_command", schema = "pianoml")
@Data
public class CoachCommand {

  public static final String PENDING = "pending";
  public static final String SENT = "sent";
  public static final String DONE = "done";
  public static final String EXPIRED = "expired";

  @Id
  private UUID id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "tab_id", nullable = false)
  private UUID tabId;

  @Column(name = "grant_id", nullable = false)
  private UUID grantId;

  @Column(name = "client_name", nullable = false, length = 80)
  private String clientName;

  @Column(nullable = false, length = 40)
  private String tool;

  @Column(columnDefinition = "text")
  private String args;

  @Column(nullable = false, length = 12)
  private String status;

  @Column(columnDefinition = "text")
  private String result;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;
}
