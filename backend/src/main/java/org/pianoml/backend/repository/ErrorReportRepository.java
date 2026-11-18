package org.pianoml.backend.repository;

import org.pianoml.backend.entity.ErrorReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface ErrorReportRepository extends JpaRepository<ErrorReport, UUID> {

  /** Retention: one bulk delete, idempotent, so several instances may run it at once. */
  @Modifying
  @Transactional
  @Query("DELETE FROM ErrorReport e WHERE e.createdAt < :cutoff")
  int deleteOlderThan(@Param("cutoff") OffsetDateTime cutoff);

  @Modifying
  @Transactional
  @Query("DELETE FROM ErrorReport e WHERE e.fingerprint = :fingerprint")
  int deleteByFingerprint(@Param("fingerprint") String fingerprint);
}
