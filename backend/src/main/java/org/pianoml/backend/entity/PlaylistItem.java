package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A score in a playlist. A score appears at most once per playlist; positions are 0-based and dense. */
@Entity
@Table(name = "playlist_item", schema = "pianoml")
@IdClass(PlaylistItemId.class)
@Data
public class PlaylistItem {

  @Id
  @Column(name = "playlist_id", nullable = false)
  private UUID playlistId;

  @Id
  @Column(name = "score_id", nullable = false)
  private UUID scoreId;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "score_id", insertable = false, updatable = false)
  private Score score;

  @Column(nullable = false)
  private int position;

  @Column(name = "added_at", nullable = false)
  private OffsetDateTime addedAt;
}
