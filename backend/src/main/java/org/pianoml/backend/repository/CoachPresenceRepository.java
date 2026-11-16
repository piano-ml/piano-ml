package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachPresence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface CoachPresenceRepository extends JpaRepository<CoachPresence, UUID> {

  /** The user's tabs seen since {@code since}, the most recently focused first. */
  @Query("SELECT p FROM CoachPresence p WHERE p.userId = :userId AND p.lastSeenAt > :since ORDER BY p.lastFocusAt DESC")
  List<CoachPresence> live(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

  @Query("SELECT COUNT(p) FROM CoachPresence p WHERE p.userId = :userId AND p.lastSeenAt > :since")
  long countLive(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

  @Transactional
  @Modifying
  @Query("UPDATE CoachPresence p SET p.lastSeenAt = :now WHERE p.tabId = :tabId AND p.userId = :userId")
  int seen(@Param("tabId") UUID tabId, @Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  @Transactional
  @Modifying
  @Query("UPDATE CoachPresence p SET p.lastSeenAt = :now, p.lastFocusAt = :now WHERE p.tabId = :tabId AND p.userId = :userId")
  int focused(@Param("tabId") UUID tabId, @Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  @Transactional
  @Modifying
  @Query("DELETE FROM CoachPresence p WHERE p.tabId = :tabId AND p.userId = :userId")
  int remove(@Param("tabId") UUID tabId, @Param("userId") UUID userId);

  @Transactional
  @Modifying
  @Query("DELETE FROM CoachPresence p WHERE p.lastSeenAt < :before")
  int deleteStale(@Param("before") OffsetDateTime before);
}
