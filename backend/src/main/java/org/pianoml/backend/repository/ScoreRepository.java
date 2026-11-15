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

  /** Where the files of a score are stored: enough to delete them without loading the whole entity. */
  interface StoredFilesRef {
    UUID getId();

    UUID getMbid();

    Integer getVersion();

    Boolean getHasFiles();
  }

  /** Every score of an owner (deleted ones included), as file references only. */
  @Query("SELECT s.id AS id, s.mbid AS mbid, s.version AS version, s.hasFiles AS hasFiles FROM Score s WHERE s.owner.id = :ownerId")
  List<StoredFilesRef> findStoredFilesByOwnerId(@Param("ownerId") UUID ownerId);

  /** Deletes every score row of an owner; their play counts must be deleted first. */
  @Modifying
  @Query(value = "DELETE FROM pianoml.score WHERE owner_id = :ownerId", nativeQuery = true)
  int deleteAllByOwnerId(@Param("ownerId") UUID ownerId);

  Optional<Score> findByImmutableSlug(String immutableSlug);

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

  /**
   * Moves every score (including soft-deleted ones) from one owner to another.
   *
   * @return number of scores moved
   */
  @Modifying
  @Query(value = "UPDATE pianoml.score SET owner_id = :toOwnerId WHERE owner_id = :fromOwnerId", nativeQuery = true)
  int reassignOwner(@Param("fromOwnerId") UUID fromOwnerId, @Param("toOwnerId") UUID toOwnerId);

  // Custom implementation provides countScoresGroupedByAuthor(Integer offset, Integer limit)
}
