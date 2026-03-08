package org.pianoml.backend.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
public class GenreTreeNodeDto {
  // mbid is the external MusicBrainz id stored in the genre_tree table
  private UUID id;
  private String name;
  private UUID parent_id;
  private List<GenreTreeNodeDto> children = new ArrayList<>();
}
