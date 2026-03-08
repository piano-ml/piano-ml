package org.pianoml.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.util.UUID;

@Entity
@Table(name = "genre_tree", schema = "pianoml")
@Data
public class GenreTree {

  @Id
  @Column(name = "genre_id", nullable = false)
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "parent_id")
  // parent relation stores the parent MBID as a foreign key to the same table
  private GenreTree parent;

}
