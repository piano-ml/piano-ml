package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachAudit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface CoachAuditRepository extends JpaRepository<CoachAudit, Long> {

  List<CoachAudit> findByGrantIdOrderByIdAsc(UUID grantId);

  @Transactional
  @Modifying
  @Query("DELETE FROM CoachAudit a WHERE a.at < :cutoff")
  int deleteOlderThan(@Param("cutoff") OffsetDateTime cutoff);
}
