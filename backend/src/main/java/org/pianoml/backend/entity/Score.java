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

    private Integer version;

    private Integer year;

    @Column(name = "tracks_count")
    private Integer tracksCount;

    @Column(name = "hand_separated")
    private Boolean handSeparated;

    @Column(name = "has_lyrics")
    private Boolean hasLyrics;

    private Integer measures;

    private Float duration;

    private Integer grade;

    @Column(name = "uploaded_at")
    private OffsetDateTime uploadedAt;

    @ManyToOne
    @JoinColumn(name = "uploaded_by")
    private User uploadedBy;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @Column(name = "has_mxml")
    private Boolean hasMxml;

    @Column(name = "has_pdf")
    private Boolean hasPdf;

    private String image;
}
