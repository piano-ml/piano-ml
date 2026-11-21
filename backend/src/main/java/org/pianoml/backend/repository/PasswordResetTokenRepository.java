package org.pianoml.backend.repository;

import org.pianoml.backend.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

  Optional<PasswordResetToken> findByTokenHash(String tokenHash);

  /** How many links the user was sent since a time, to cap the emails sent to one account. */
  long countByUserIdAndCreatedAtAfter(UUID userId, OffsetDateTime since);

  /** Ends every link of the user still valid; the rows stay, to count the emails sent. */
  @Modifying
  @Query("update PasswordResetToken t set t.expiresAt = :now where t.userId = :userId and t.expiresAt > :now")
  int expireAllOfUser(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  /** Deletes the links expired and created before a time (kept until then to count the emails sent). */
  @Modifying
  @Query("delete from PasswordResetToken t where t.expiresAt <= :now and t.createdAt < :createdBefore")
  int deleteExpired(@Param("now") OffsetDateTime now, @Param("createdBefore") OffsetDateTime createdBefore);
}
