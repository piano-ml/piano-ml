package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.model.ScoreApiInfo;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Mapper(componentModel = "spring", uses = {AuthorMapper.class, GenreMapper.class, UserMapper.class, UriMapper.class})
public interface ScoreMapper {

    @Mapping(source = "author.name", target = "author")
    @Mapping(source = "author.id", target = "authorId")
    @Mapping(source = "genre.name", target = "genre")
    @Mapping(source = "genre.id", target = "genreId")
    @Mapping(source = "studyTracks", target = "studyTracks", qualifiedByName = "stringToIntegerList")
    ScoreApiInfo toScoreApiInfo(Score score);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "author", ignore = true)
    @Mapping(target = "genre", ignore = true)
    @Mapping(source = "studyTracks", target = "studyTracks",  qualifiedByName = "integerListToString")
    Score toScore(ScoreApiInfo scoreApiInfo);

    @Named("stringToIntegerList")
    public static List<Integer> stringToIntegerList(String value) {
        if (value == null || value.isEmpty()) return List.of();
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .map(Integer::valueOf)
                .collect(Collectors.toList());
    }

    @Named("integerListToString")
    public static String integerListToString(List<Integer> value) {
        if (value == null || value.isEmpty()) return "";
        return value.stream().map(String::valueOf).collect(Collectors.joining(","));
    }
}
