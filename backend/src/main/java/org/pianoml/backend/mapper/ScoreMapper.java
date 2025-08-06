package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.model.ScoreApiInfo;

@Mapper(componentModel = "spring", uses = {AuthorMapper.class, GenreMapper.class, UserMapper.class, UriMapper.class})
public interface ScoreMapper {

    @Mapping(source = "author.name", target = "author")
    @Mapping(source = "author.id", target = "authorId")
    @Mapping(source = "genre.name", target = "genre")
    @Mapping(source = "genre.id", target = "genreId")
    @Mapping(source = "uploadedBy.id", target = "uploadedById")
    @Mapping(source = "uploadedBy.name", target = "uploadedByName")
    ScoreApiInfo toScoreApiInfo(Score score);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "author", ignore = true)
    @Mapping(target = "genre", ignore = true)
    @Mapping(target = "uploadedBy", ignore = true)
    Score toScore(ScoreApiInfo scoreApiInfo);
}
