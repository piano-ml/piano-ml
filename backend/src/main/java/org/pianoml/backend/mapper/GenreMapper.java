package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.model.GenreApiInfo;

@Mapper(componentModel = "spring", uses = UriMapper.class)
public interface GenreMapper {

    GenreApiInfo toGenreApiInfo(Genre genre);

    Genre toGenre(GenreApiInfo genreApiInfo);
}
