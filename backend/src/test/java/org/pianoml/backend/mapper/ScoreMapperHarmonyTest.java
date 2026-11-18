package org.pianoml.backend.mapper;

import org.junit.jupiter.api.Test;
import org.openapitools.jackson.nullable.JsonNullable;
import org.pianoml.backend.model.HarmonyEntry;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The harmony JSON column (issue #415): a slash chord (bass) must not make the whole harmony disappear. */
class ScoreMapperHarmonyTest {

  private static final String STORED = """
    [{"measure":1,"beat":1.0,"root":"C","kind":"major"},
     {"measure":2,"beat":1.0,"root":"G","kind":"dominant","bass":"B"},
     {"measure":3,"beat":1.0,"root":"C","kind":"major","bass":null}]
    """;

  @Test
  void aHarmonyWithASlashChord_isReadWhole_bassIncluded() {
    JsonNullable<List<HarmonyEntry>> harmony = ScoreMapper.harmonyJsonToList(STORED);
    assertThat(harmony.isPresent()).isTrue();
    List<HarmonyEntry> entries = harmony.get();
    assertThat(entries).hasSize(3);
    assertThat(entries.get(0).getBass().isPresent()).isFalse();
    assertThat(entries.get(1).getRoot()).isEqualTo("G");
    assertThat(entries.get(1).getBass()).isEqualTo(JsonNullable.of("B"));
    assertThat(entries.get(2).getBass()).isEqualTo(JsonNullable.of(null));
  }

  @Test
  void writing_keepsTheBass_andLeavesAnAbsentOneOut_soItReadsBackTheSame() {
    List<HarmonyEntry> entries = ScoreMapper.harmonyJsonToList(STORED).get();
    String written = ScoreMapper.harmonyListToJson(JsonNullable.of(entries));
    assertThat(written).contains("\"bass\":\"B\"");
    assertThat(written).doesNotContain("present").doesNotContain("undefined");
    assertThat(written.split("\"bass\"", -1)).hasSize(3); // the absent bass is left out, the null one is kept
    assertThat(ScoreMapper.harmonyJsonToList(written).get()).isEqualTo(entries);
  }

  @Test
  void unreadableJson_isLeftOut() {
    assertThat(ScoreMapper.harmonyJsonToList("not json").isPresent()).isFalse();
    assertThat(ScoreMapper.harmonyJsonToList(null).isPresent()).isFalse();
  }

  @Test
  void youtubeLinks_stillRoundTrip() {
    String stored = "[{\"url\":\"https://www.youtube.com/watch?v=abc\",\"rank\":1}]";
    var links = ScoreMapper.youtubeJsonToList(stored);
    assertThat(links.isPresent()).isTrue();
    assertThat(ScoreMapper.youtubeJsonToList(ScoreMapper.youtubeListToJson(links)).get()).isEqualTo(links.get());
  }
}
