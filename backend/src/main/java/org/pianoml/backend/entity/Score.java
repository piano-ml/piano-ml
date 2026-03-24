package org.pianoml.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
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

  @ManyToOne(fetch = FetchType.EAGER)
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

  @Column(name = "measures_count")
  private Integer measuresCount;

  @Column(name = "hand_separated")
  private Boolean handSeparated;

  @Column(name = "has_lyrics")
  private Boolean hasLyrics;

  @Column(name = "grade")
  private Integer grade;

  @Column(name = "uploaded_at")
  private OffsetDateTime uploadedAt;

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

  @Column(name = "duration")
  private int duration;

  @Column(name = "study_tracks")
  private String studyTracks;

  @Column(name = "publish")
  private Boolean publish;

  @Column(name = "etude")
  private Boolean etude;

  @Column(name = "immutable_slug")
  private String immutableSlug;

  @Column(name = "mutable_slug")
  private String mutableSlug;

  @Column(name = "tempo")
  private Integer tempo;

  @Column(name = "public_domain")
  private Boolean publicDomain = true;

  @Column(name = "exercise")
  private Boolean exercise = false;

  @Column(name = "play_count")
  private Long playCount = 0L;

  @Column(name = "tonic", length = 10)
  private String tonic;

  @Column(name = "mode", length = 10)
  private String mode;

  @Column(name = "full_key", length = 50)
  private String fullKey;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "harmony", columnDefinition = "json")
  private String harmony;

}
