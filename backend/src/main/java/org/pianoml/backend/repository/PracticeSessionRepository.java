package org.pianoml.backend.repository;

import org.pianoml.backend.entity.PracticeSession;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PracticeSessionRepository extends JpaRepository<PracticeSession, UUID> {

  List<PracticeSession> findByUserIdOrderByStartedAtDesc(UUID userId, Pageable pageable);

  List<PracticeSession> findByUserIdAndKindOrderByStartedAtDesc(UUID userId, String kind, Pageable pageable);

  List<PracticeSession> findByUserIdAndScoreIdOrderByStartedAtDesc(UUID userId, UUID scoreId, Pageable pageable);

  @Modifying
  @Query("DELETE FROM PracticeSession p WHERE p.userId = :userId")
  int deleteAllOfUser(@Param("userId") UUID userId);
}
