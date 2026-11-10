package org.pianoml.backend.service;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * makeFingering flows: upload query param -> PackScriptDto -> Workload -> PackScriptDto -> 4th arg of *2pack.sh.
 */
class PackScriptMakeFingeringsTest {

  private static Score score() {
    Score score = new Score();
    score.setId(UUID.randomUUID());
    score.setTitle("Nocturne");
    Author author = new Author();
    author.setName("Chopin");
    score.setAuthor(author);
    score.setStudyTracks("1,2");
    return score;
  }

  // input: "" = null (param omitted / legacy workload row)
  @ParameterizedTest
  @CsvSource({"true,true", "false,false", ",true"})
  void dto_defaultsToTrueWhenNull(Boolean input, boolean expected) {
    PackScriptDto dto = new PackScriptDto(new ByteArrayInputStream(new byte[0]), score(), "pdf", input);
    assertEquals(expected, dto.getMakeFingerings());
  }

  @ParameterizedTest
  @CsvSource({"true,true", "false,false", ",true"})
  void scriptCommand_passesMakeFingeringAsFourthArgument(Boolean input, String expectedArg) {
    PackScriptDto dto = new PackScriptDto(new ByteArrayInputStream(new byte[0]), score(), "midi", input);
    File in = new File("/tmp/upload_x.midi");

    List<String> cmd = PackService.buildScriptCommand("scripts/midi2pack.sh", in, dto);

    assertEquals(List.of("scripts/midi2pack.sh", in.getAbsolutePath(), "Nocturne", "Chopin", expectedArg, "1", "2"), cmd);
  }
}
