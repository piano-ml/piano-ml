package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachOAuthCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

public interface CoachOAuthCodeRepository extends JpaRepository<CoachOAuthCode, String> {

  /** Marks an unused code used; 1 for the one caller that wins, 0 when it was already used. */
  @Transactional
  @Modifying
  @Query("UPDATE CoachOAuthCode c SET c.usedAt = :now WHERE c.codeHash = :hash AND c.usedAt IS NULL")
  int markUsed(@Param("hash") String hash, @Param("now") OffsetDateTime now);

  @Transactional
  @Modifying
  @Query("UPDATE CoachOAuthCode c SET c.grantId = :grantId WHERE c.codeHash = :hash")
  int setGrant(@Param("hash") String hash, @Param("grantId") java.util.UUID grantId);

  /** Kept a day after expiry, so that a late second use is still recognized as a reuse (phase O4). */
  @Transactional
  @Modifying
  @Query("DELETE FROM CoachOAuthCode c WHERE c.expiresAt < :cutoff")
  int deleteExpiredBefore(@Param("cutoff") OffsetDateTime cutoff);
}
