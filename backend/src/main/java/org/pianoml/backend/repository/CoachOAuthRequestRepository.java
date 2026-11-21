package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachOAuthRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface CoachOAuthRequestRepository extends JpaRepository<CoachOAuthRequest, String> {

  /** Binds a pending request to the first logged-in user who opens it. */
  @Transactional
  @Modifying
  @Query("""
    UPDATE CoachOAuthRequest r SET r.userId = :userId
    WHERE r.idHash = :idHash AND r.userId IS NULL AND r.decidedAt IS NULL AND r.expiresAt > :now
    """)
  int bind(@Param("idHash") String idHash, @Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  /** Marks a pending request of this user decided; 1 for the one caller that wins, 0 for everyone else. */
  @Transactional
  @Modifying
  @Query("""
    UPDATE CoachOAuthRequest r SET r.decidedAt = :now, r.userId = :userId
    WHERE r.idHash = :idHash AND (r.userId IS NULL OR r.userId = :userId) AND r.decidedAt IS NULL
      AND r.expiresAt > :now
    """)
  int decide(@Param("idHash") String idHash, @Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  @Transactional
  @Modifying
  @Query("DELETE FROM CoachOAuthRequest r WHERE r.expiresAt < :cutoff")
  int deleteExpiredBefore(@Param("cutoff") OffsetDateTime cutoff);
}
