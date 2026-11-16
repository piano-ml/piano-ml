package org.pianoml.backend.repository;

import org.pianoml.backend.entity.CoachCommand;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface CoachCommandRepository extends JpaRepository<CoachCommand, UUID> {

  /** The pending, unexpired commands of these tabs, oldest first: one query per pump tick. */
  @Query("SELECT c FROM CoachCommand c WHERE c.status = 'pending' AND c.expiresAt > :now AND c.tabId IN :tabIds ORDER BY c.createdAt")
  List<CoachCommand> pendingFor(@Param("tabIds") Collection<UUID> tabIds, @Param("now") OffsetDateTime now);

  /** Claims a command for delivery; 1 means this caller claimed it and must send it. */
  @Transactional
  @Modifying
  @Query("UPDATE CoachCommand c SET c.status = 'sent' WHERE c.id = :id AND c.status = 'pending' AND c.expiresAt > :now")
  int claim(@Param("id") UUID id, @Param("now") OffsetDateTime now);

  /** Stores the result sent by the tab the command was sent to, and only by it. */
  @Transactional
  @Modifying
  @Query("UPDATE CoachCommand c SET c.status = 'done', c.result = :result"
    + " WHERE c.id = :id AND c.userId = :userId AND c.tabId = :tabId AND c.status = 'sent'")
  int complete(@Param("id") UUID id, @Param("userId") UUID userId, @Param("tabId") UUID tabId, @Param("result") String result);

  @Transactional
  @Modifying
  @Query("UPDATE CoachCommand c SET c.status = 'expired' WHERE c.id = :id AND c.status IN ('pending', 'sent')")
  int expire(@Param("id") UUID id);

  @Transactional
  @Modifying
  @Query("DELETE FROM CoachCommand c WHERE c.createdAt < :before")
  int deleteOlderThan(@Param("before") OffsetDateTime before);
}
