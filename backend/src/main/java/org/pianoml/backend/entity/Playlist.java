package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A user-owned ordered list of scores (issue #278). The Favorites playlist is the owner's default one
 * ({@code isDefault}, slug {@value #FAVORITES_SLUG}). The slug is set once at creation and never changes.
 */
@Entity
@Table(name = "playlist", schema = "pianoml")
@Data
public class Playlist {

  public static final String FAVORITES_SLUG = "favorites";
  public static final String FAVORITES_TITLE = "Favorites";

  @Id
  private UUID id;

  @Column(name = "owner_id", nullable = false, updatable = false)
  private UUID ownerId;

  @Column(nullable = false, length = 100)
  private String title;

  @Column(nullable = false, length = 120, updatable = false)
  private String slug;

  @Column(length = 1000)
  private String description;

  @Column(name = "is_default", nullable = false, updatable = false)
  private boolean isDefault;

  @Column(name = "created_at", nullable = false, updatable = false)
  private OffsetDateTime createdAt;

  /** Changed by a rename or a description edit, and by any item added, removed or moved. */
  @Column(name = "last_modified", nullable = false)
  private OffsetDateTime lastModified;
}
