package org.pianoml.backend.repository;

import org.pianoml.backend.entity.PlaylistItem;
import org.pianoml.backend.entity.PlaylistItemId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface PlaylistItemRepository extends JpaRepository<PlaylistItem, PlaylistItemId> {

  List<PlaylistItem> findByPlaylistIdOrderByPosition(UUID playlistId);

  /** Visible items (deleted scores left out), in order, with their score. */
  @Query("SELECT i FROM PlaylistItem i JOIN FETCH i.score s WHERE i.playlistId = :playlistId AND s.deleted = false ORDER BY i.position")
  List<PlaylistItem> findVisibleWithScore(@Param("playlistId") UUID playlistId);

  @Query("SELECT COALESCE(MAX(i.position), -1) FROM PlaylistItem i WHERE i.playlistId = :playlistId")
  int maxPosition(@Param("playlistId") UUID playlistId);

  long countByPlaylistId(UUID playlistId);

  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query("UPDATE PlaylistItem i SET i.position = i.position - 1 WHERE i.playlistId = :playlistId AND i.position > :position")
  int closeGap(@Param("playlistId") UUID playlistId, @Param("position") int position);

  @Query("SELECT i.scoreId FROM PlaylistItem i JOIN i.score s WHERE i.playlistId = :playlistId AND s.deleted = false ORDER BY i.position")
  List<UUID> findVisibleScoreIds(@Param("playlistId") UUID playlistId);

  @Query("SELECT i.playlistId FROM PlaylistItem i WHERE i.scoreId = :scoreId AND i.playlistId IN :playlistIds")
  List<UUID> findPlaylistsContaining(@Param("scoreId") UUID scoreId, @Param("playlistIds") Collection<UUID> playlistIds);
}
