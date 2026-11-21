package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachWsTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

public interface CoachWsTicketRepository extends JpaRepository<CoachWsTicket, String> {

  /** Deletes the ticket if it is still valid; 1 means it was, and is now used up. */
  @Transactional
  @Modifying
  @Query("DELETE FROM CoachWsTicket t WHERE t.ticketHash = :hash AND t.expiresAt > :now")
  int consume(@Param("hash") String hash, @Param("now") OffsetDateTime now);

  @Transactional
  @Modifying
  @Query("DELETE FROM CoachWsTicket t WHERE t.expiresAt <= :now")
  int deleteExpired(@Param("now") OffsetDateTime now);
}
