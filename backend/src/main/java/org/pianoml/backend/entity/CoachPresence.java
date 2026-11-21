package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A browser tab with Remote coach on (issue #414), and the server instance that holds its WebSocket. */
@Entity
@Table(name = "coach_presence", schema = "pianoml")
@Data
public class CoachPresence {

  @Id
  @Column(name = "tab_id")
  private UUID tabId;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 64)
  private String instance;

  @Column(name = "connected_at", nullable = false)
  private OffsetDateTime connectedAt;

  @Column(name = "last_seen_at", nullable = false)
  private OffsetDateTime lastSeenAt;

  @Column(name = "last_focus_at", nullable = false)
  private OffsetDateTime lastFocusAt;
}
