package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ScoreRepository extends CrudRepository<Score, UUID>, IScoreRepositoryCustom {

  Integer countScoreByMbidAndOwner(UUID mbid, User owner);

  //Optional<Score> findScoreByMbidAndOwnerAndVersion(UUID mbid, User owner, Integer version);

  List<Score> findByImmutableSlugStartingWith(String slugPrefix);

  Optional<Score> findByImmutableSlug(String immutableSlug);

  // Count scores with the given immutable slug (Spring Data will derive the query)
  Integer countScoreByImmutableSlug(String immutableSlug);

  Optional<Score> findScoreByIdAndOwnerAndVersion(UUID uuid, User user, Integer version);

  /**
   * Incrémente le compteur de lecture (play_count) pour un score donné.
   *
   * @param scoreId L'ID du score
   */
  @Transactional
  @Modifying
  @Query("UPDATE Score s SET s.playCount = s.playCount + 1 WHERE s.id = :scoreId")
  void incrementPlayCount(@Param("scoreId") UUID scoreId);

  // Custom implementation provides countScoresGroupedByAuthor(Integer offset, Integer limit)
}
