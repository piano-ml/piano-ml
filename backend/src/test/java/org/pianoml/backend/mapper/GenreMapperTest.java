package org.pianoml.backend.mapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.model.GenreApiInfo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class GenreMapperTest {

  private GenreMapper mapper;

  @BeforeEach
  void setup() {
    mapper = new GenreMapperImpl();
  }

  @Test
  void toGenreApiInfo_mapsFields_andLeavesComputedScoreCountUnset() {
    Genre genre = new Genre();
    genre.setName("Nocturne");
    genre.setDescription("night piece");

    GenreApiInfo api = mapper.toGenreApiInfo(genre);

    assertEquals("Nocturne", api.getName());
    assertEquals("night piece", api.getDescription());
    assertNull(api.getScoreCount());
  }

  @Test
  void toGenre_ignoresScoreCountFromPayload() {
    GenreApiInfo api = new GenreApiInfo();
    api.setName("Etude");
    api.setScoreCount(999);

    Genre genre = mapper.toGenre(api);

    assertEquals("Etude", genre.getName());
  }
}
