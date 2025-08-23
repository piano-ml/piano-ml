package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "score", schema = "pianoml")
@Data
public class Score {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Column(nullable = false)
  private String title;

  @ManyToOne
  @JoinColumn(name = "author_id", nullable = false)
  private Author author;

  @ManyToOne
  @JoinColumn(name = "genre_id")
  private Genre genre;

  @Column(name = "version")
  private Integer version;

  @ManyToOne
  @JoinColumn(name = "owner_id", nullable = false)
  private User owner;

  @Column(name = "tracks_count")
  private Integer tracksCount;

  @Column(name = "hand_separated")
  private Boolean handSeparated;

  @Column(name = "has_lyrics")
  private Boolean hasLyrics;

  @Column(name = "grade")
  private Integer grade;

  @Column(name = "updated_at")
  private OffsetDateTime updatedAt;

  @Column(name = "image")
  private String image;

  @Column(nullable = false)
  private UUID mbid;

  @Column(name = "has_files", nullable = false)
  private Boolean hasFiles = false;

  @Column(name = "deleted", nullable = false)
  private Boolean deleted = false;

  @Column(name = "duration", nullable = true)
  private int duration;

  @Column(name = "study_tracks")
  private String studyTracks;

  @Column(name = "publish")
  private Boolean publish;

}
