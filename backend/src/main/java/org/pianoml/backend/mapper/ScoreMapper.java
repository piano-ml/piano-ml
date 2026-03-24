package org.pianoml.backend.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.openapitools.jackson.nullable.JsonNullable;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.model.HarmonyEntry;
import org.pianoml.backend.model.ScoreApiInfo;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Mapper(componentModel = "spring", uses = {AuthorMapper.class, GenreMapper.class, UserMapper.class, UriMapper.class})
public interface ScoreMapper {

  @Named("stringToIntegerList")
  public static List<Integer> stringToIntegerList(String value) {
    if (value == null || value.isEmpty()) return List.of();
    try {
      return Arrays.stream(value.split(","))
        .map(String::trim)
        .map(Integer::valueOf)
        .collect(Collectors.toList());
    } catch (Exception e) {
      return List.of();
    }
  }

  @Named("integerListToString")
  public static String integerListToString(List<Integer> value) {
    if (value == null || value.isEmpty()) return "";
    return value.stream().map(String::valueOf).collect(Collectors.joining(","));
  }

  ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  @Named("harmonyJsonToList")
  public static JsonNullable<List<HarmonyEntry>> harmonyJsonToList(String value) {
    if (value == null) return JsonNullable.undefined();
    try {
      List<HarmonyEntry> list = OBJECT_MAPPER.readValue(value, new TypeReference<List<HarmonyEntry>>() {});
      return JsonNullable.of(list);
    } catch (JsonProcessingException e) {
      return JsonNullable.undefined();
    }
  }

  @Named("harmonyListToJson")
  public static String harmonyListToJson(JsonNullable<List<HarmonyEntry>> value) {
    if (value == null || !value.isPresent() || value.get() == null) return null;
    try {
      return OBJECT_MAPPER.writeValueAsString(value.get());
    } catch (JsonProcessingException e) {
      return null;
    }
  }

  @Mapping(source = "author.name", target = "author")
  @Mapping(source = "author.id", target = "authorId")
  @Mapping(source = "author.sortName", target = "sortName")
  @Mapping(source = "author.slug", target = "authorSlug")
  @Mapping(source = "author.mbid", target = "authorMbid")
  @Mapping(source = "genre.name", target = "genre")
  @Mapping(source = "genre.id", target = "genreId")
  @Mapping(source = "genre.slug", target = "genreSlug")
  @Mapping(source = "owner.id", target = "ownerId")
  @Mapping(source = "measuresCount", target = "measures")
  @Mapping(source = "owner.name", target = "owner")
  @Mapping(source = "studyTracks", target = "studyTracks", qualifiedByName = "stringToIntegerList")
  @Mapping(source = "harmony", target = "harmony", qualifiedByName = "harmonyJsonToList")
  ScoreApiInfo toScoreApiInfo(Score score);

  @Mapping(target = "id", ignore = true)
  @Mapping(target = "author", ignore = true)
  @Mapping(target = "genre", ignore = true)
  @Mapping(target = "owner", ignore = true)
  @Mapping(source = "studyTracks", target = "studyTracks", qualifiedByName = "integerListToString")
  @Mapping(source = "harmony", target = "harmony", qualifiedByName = "harmonyListToJson")
  Score toScore(ScoreApiInfo scoreApiInfo);
}
