package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachOAuthCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

public interface CoachOAuthCodeRepository extends JpaRepository<CoachOAuthCode, String> {

  /** Kept a day after expiry, so that a late second use is still recognized as a reuse (phase O4). */
  @Transactional
  @Modifying
  @Query("DELETE FROM CoachOAuthCode c WHERE c.expiresAt < :cutoff")
  int deleteExpiredBefore(@Param("cutoff") OffsetDateTime cutoff);
}
