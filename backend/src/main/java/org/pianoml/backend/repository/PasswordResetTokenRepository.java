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

  /** The user's latest link, to space out the emails sent to one account. */
  Optional<PasswordResetToken> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

  @Modifying
  @Query("delete from PasswordResetToken t where t.userId = :userId")
  int deleteAllOfUser(@Param("userId") UUID userId);

  @Modifying
  @Query("delete from PasswordResetToken t where t.expiresAt < :now")
  int deleteExpired(@Param("now") OffsetDateTime now);
}
