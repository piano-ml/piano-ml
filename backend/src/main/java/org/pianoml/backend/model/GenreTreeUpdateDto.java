package org.pianoml.backend.model;

import lombok.Data;

import java.util.UUID;

@Data
public class GenreTreeUpdateDto {
  private UUID parent_id;
}
