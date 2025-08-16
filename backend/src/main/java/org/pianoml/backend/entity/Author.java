package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "author", schema = "pianoml")
@Data
public class Author {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name="mbid")
    private UUID mbid;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(name = "disambiguation")
    private String disambiguation;

    @Column(name = "country")
    private String country;

    @Column(name = "type")
    private String type;

    @Column(name = "gender")
    private String gender;

    @Column(name = "life_span_begin")
    private LocalDate  lifeSpanBegin;

    @Column(name = "life_span_end")
    private LocalDate lifeSpanEnd;

    @Column(name = "life_span_ended")
    private Boolean lifeSpanEnded;


}
