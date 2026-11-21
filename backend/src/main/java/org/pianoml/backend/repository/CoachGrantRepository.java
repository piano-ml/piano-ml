package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachGrant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CoachGrantRepository extends JpaRepository<CoachGrant, UUID> {

  List<CoachGrant> findByUserIdOrderByCreatedAtDesc(UUID userId);

  Optional<CoachGrant> findByIdAndUserId(UUID id, UUID userId);

  /** Grants of this kind neither revoked nor expired at {@code now}. */
  @Query("""
    SELECT COUNT(g) FROM CoachGrant g
    WHERE g.userId = :userId AND g.kind = :kind AND g.revokedAt IS NULL AND g.expiresAt > :now
    """)
  long countLive(@Param("userId") UUID userId, @Param("kind") String kind, @Param("now") OffsetDateTime now);

  /** The user's live OAuth grants, least recently used first. */
  @Query("""
    SELECT g FROM CoachGrant g
    WHERE g.userId = :userId AND g.kind = 'oauth' AND g.revokedAt IS NULL AND g.expiresAt > :now
    ORDER BY COALESCE(g.lastUsedAt, g.createdAt) ASC
    """)
  List<CoachGrant> findLiveOAuth(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  /** Revokes one grant, if still live. */
  @Transactional
  @Modifying
  @Query("UPDATE CoachGrant g SET g.revokedAt = :now WHERE g.id = :id AND g.revokedAt IS NULL")
  int revokeById(@Param("id") UUID id, @Param("now") OffsetDateTime now);

  /** Records a use, at most once per minute: only when the last recorded use is older than {@code before}. */
  @Transactional
  @Modifying
  @Query("UPDATE CoachGrant g SET g.lastUsedAt = :now WHERE g.id = :id AND (g.lastUsedAt IS NULL OR g.lastUsedAt < :before)")
  int touch(@Param("id") UUID id, @Param("now") OffsetDateTime now, @Param("before") OffsetDateTime before);

  @Transactional
  @Modifying
  @Query("UPDATE CoachGrant g SET g.revokedAt = :now WHERE g.userId = :userId AND g.revokedAt IS NULL")
  int revokeAllOf(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  /** Deletes the grants expired or revoked before {@code cutoff}. */
  @Transactional
  @Modifying
  @Query("DELETE FROM CoachGrant g WHERE g.expiresAt < :cutoff OR g.revokedAt < :cutoff")
  int deleteStale(@Param("cutoff") OffsetDateTime cutoff);
}
