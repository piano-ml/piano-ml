package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.model.GenreApiInfo;

@Mapper(componentModel = "spring", uses = UriMapper.class)
public interface GenreMapper {

  // scoreCount is computed (GenreService count queries), not stored on Genre; read-only in the API.
  @Mapping(target = "scoreCount", ignore = true)
  GenreApiInfo toGenreApiInfo(Genre genre);

  Genre toGenre(GenreApiInfo genreApiInfo);
}
