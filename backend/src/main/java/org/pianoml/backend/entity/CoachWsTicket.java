package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A one-time ticket that opens the Remote coach WebSocket (issue #414). Only the hash of the ticket is stored. */
@Entity
@Table(name = "coach_ws_ticket", schema = "pianoml")
@Data
public class CoachWsTicket {

  @Id
  @Column(name = "ticket_hash", length = 64)
  private String ticketHash;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;
}
