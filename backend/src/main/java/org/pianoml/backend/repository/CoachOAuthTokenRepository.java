package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachOAuthToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

public interface CoachOAuthTokenRepository extends JpaRepository<CoachOAuthToken, String> {

  /** Marks an unused token used; 1 for the one caller that wins, 0 when it was already used. */
  @Transactional
  @Modifying
  @Query("UPDATE CoachOAuthToken t SET t.usedAt = :now WHERE t.tokenHash = :hash AND t.usedAt IS NULL")
  int markUsed(@Param("hash") String hash, @Param("now") OffsetDateTime now);

  /** Ends an access token now (RFC 7009 revocation of an access token). */
  @Transactional
  @Modifying
  @Query("UPDATE CoachOAuthToken t SET t.expiresAt = :now WHERE t.tokenHash = :hash AND t.expiresAt > :now")
  int expire(@Param("hash") String hash, @Param("now") OffsetDateTime now);

  @Transactional
  @Modifying
  @Query("DELETE FROM CoachOAuthToken t WHERE t.expiresAt < :cutoff")
  int deleteExpiredBefore(@Param("cutoff") OffsetDateTime cutoff);
}
