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

  /**
   * Only the sessions where something was assessed (accuracy or flow) count: listening, or playing without a MIDI
   * keyboard, is not practice. Such sessions are no longer stored; this leaves out those stored before.
   */
  String ASSESSED = "(p.accuracy IS NOT NULL OR p.flow IS NOT NULL)";

  @Query("SELECT p FROM PracticeSession p WHERE p.userId = :userId AND " + ASSESSED + " ORDER BY p.startedAt DESC")
  List<PracticeSession> findAssessed(@Param("userId") UUID userId, Pageable pageable);

  @Query("SELECT p FROM PracticeSession p WHERE p.userId = :userId AND p.kind = :kind AND " + ASSESSED
    + " ORDER BY p.startedAt DESC")
  List<PracticeSession> findAssessedByKind(@Param("userId") UUID userId, @Param("kind") String kind, Pageable pageable);

  @Query("SELECT p FROM PracticeSession p WHERE p.userId = :userId AND p.scoreId = :scoreId AND " + ASSESSED
    + " ORDER BY p.startedAt DESC")
  List<PracticeSession> findAssessedByScore(@Param("userId") UUID userId, @Param("scoreId") UUID scoreId, Pageable pageable);

  @Modifying
  @Query("DELETE FROM PracticeSession p WHERE p.userId = :userId")
  int deleteAllOfUser(@Param("userId") UUID userId);
}
