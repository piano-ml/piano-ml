package org.pianoml.backend.repository;

import jakarta.persistence.LockModeType;
import org.pianoml.backend.entity.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, UUID> {

  Optional<Playlist> findByOwnerIdAndSlug(UUID ownerId, String slug);

  /** Locks the playlist row: item writes on one playlist run one at a time (positions stay unique and dense). */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT p FROM Playlist p WHERE p.id = :id")
  Optional<Playlist> lockById(@Param("id") UUID id);

  long countByOwnerId(UUID ownerId);

  @Query("SELECT p.slug FROM Playlist p WHERE p.ownerId = :ownerId AND (p.slug = :base OR p.slug LIKE CONCAT(:base, '-%'))")
  List<String> findSlugsLike(@Param("ownerId") UUID ownerId, @Param("base") String base);

  /** The owner's playlists, Favorites first, then most recently modified. */
  @Query("SELECT p FROM Playlist p WHERE p.ownerId = :ownerId ORDER BY p.isDefault DESC, p.lastModified DESC, p.id")
  List<Playlist> findAllOfOwner(@Param("ownerId") UUID ownerId);
}
