package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachOAuthClient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

public interface CoachOAuthClientRepository extends JpaRepository<CoachOAuthClient, String> {

  /** Refreshes the cached metadata of an existing client; {@code created_at} and {@code last_used_at} are kept. */
  @Transactional
  @Modifying
  @Query("""
    UPDATE CoachOAuthClient c SET c.clientName = :name, c.redirectUris = :redirectUris,
      c.metadataFetchedAt = :now, c.metadataExpiresAt = :expiresAt
    WHERE c.clientId = :clientId
    """)
  int updateMetadata(@Param("clientId") String clientId, @Param("name") String name,
                     @Param("redirectUris") String redirectUris, @Param("now") OffsetDateTime now,
                     @Param("expiresAt") OffsetDateTime expiresAt);

  @Transactional
  @Modifying
  @Query("UPDATE CoachOAuthClient c SET c.lastUsedAt = :now WHERE c.clientId = :clientId")
  int markUsed(@Param("clientId") String clientId, @Param("now") OffsetDateTime now);

  /** Records a use at most once per {@code before} interval: only when the last recorded use is older. */
  @Transactional
  @Modifying
  @Query("UPDATE CoachOAuthClient c SET c.lastUsedAt = :now WHERE c.clientId = :clientId AND (c.lastUsedAt IS NULL OR c.lastUsedAt < :before)")
  int touch(@Param("clientId") String clientId, @Param("now") OffsetDateTime now, @Param("before") OffsetDateTime before);

  /** Deletes the clients never used and created before {@code neverUsedBefore}, and those last used before {@code unusedBefore}. */
  @Transactional
  @Modifying
  @Query("""
    DELETE FROM CoachOAuthClient c
    WHERE (c.lastUsedAt IS NULL AND c.createdAt < :neverUsedBefore) OR c.lastUsedAt < :unusedBefore
    """)
  int deleteStale(@Param("neverUsedBefore") OffsetDateTime neverUsedBefore,
                  @Param("unusedBefore") OffsetDateTime unusedBefore);
}
