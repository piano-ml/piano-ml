package org.pianoml.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.util.UUID;

@Entity
@Table(name = "genre", schema = "pianoml")
@Data
public class Genre {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Column(nullable = false)
  private UUID mbid;

  @Column(nullable = false)
  private String name;

  @Column(name = "slug", length = 255, unique = true)
  private String slug;

  @Column(columnDefinition = "text")
  private String description;

}
