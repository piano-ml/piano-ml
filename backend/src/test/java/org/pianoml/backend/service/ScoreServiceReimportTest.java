package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.*;

/** Re-importing a MIDI score from its original upload ({@code ori.midi}) with new study tracks. */
class ScoreServiceReimportTest {

  private ScoreService scoreService;
  private Score score;

  @BeforeEach
  void setUp() {
    scoreService = spy(new ScoreService());
    User owner = new User();
    owner.setId(UUID.randomUUID());
    score = new Score();
    score.setId(UUID.randomUUID());
    score.setOwner(owner);
    score.setVersion(1);
    score.setImmutableSlug("fox-toby-my-castle-town");
    score.setStudyTracks("0,1");
  }

  private void original(String filename, String content) throws IOException {
    doReturn(Optional.of(new ScoreService.ScoreFile(filename, content.getBytes(StandardCharsets.UTF_8))))
      .when(scoreService).getOriginalFromScore(score);
  }

  @Test
  void reimportMidi_packsTheOriginalWithTheNewStudyTracks() throws IOException {
    original("ori.midi", "uploaded-midi");
    ArgumentCaptor<InputStream> upload = ArgumentCaptor.forClass(InputStream.class);
    doAnswer(invocation -> {
      // The tracks are read from the score when packing (PackScriptDto): they must be set by then
      assertEquals("3,2", ((Score) invocation.getArgument(0)).getStudyTracks());
      return null;
    }).when(scoreService).packAttachmentToScore(same(score), eq("midi"), upload.capture(), eq(false));

    Optional<Score> result = scoreService.reimportMidi(score, List.of(3, 2), false);

    assertSame(score, result.orElseThrow());
    assertEquals("3,2", score.getStudyTracks());
    assertEquals("uploaded-midi", new String(upload.getValue().readAllBytes(), StandardCharsets.UTF_8));
    // Same record: id, slug, owner and version are untouched
    assertEquals("fox-toby-my-castle-town", score.getImmutableSlug());
    assertEquals(1, score.getVersion());
  }

  @Test
  void reimportMidi_acceptsMidExtension() throws IOException {
    original("ori.mid", "uploaded-midi");
    doNothing().when(scoreService).packAttachmentToScore(any(), anyString(), any(), any());

    assertTrue(scoreService.reimportMidi(score, List.of(1), null).isPresent());
    assertEquals("1", score.getStudyTracks());
    verify(scoreService).packAttachmentToScore(same(score), eq("midi"), any(), eq(null));
  }

  @Test
  void reimportMidi_refusesAnOriginalThatIsNotMidi() throws IOException {
    original("ori.pdf", "uploaded-pdf");

    assertThrows(IllegalArgumentException.class, () -> scoreService.reimportMidi(score, List.of(0), true));
    assertEquals("0,1", score.getStudyTracks());
    verify(scoreService, never()).packAttachmentToScore(any(), anyString(), any(), anyBoolean());
  }

  @Test
  void reimportMidi_emptyWithoutOriginal() throws IOException {
    doReturn(Optional.empty()).when(scoreService).getOriginalFromScore(score);

    assertTrue(scoreService.reimportMidi(score, List.of(0), true).isEmpty());
    assertEquals("0,1", score.getStudyTracks());
  }

  @Test
  void reimportMidi_restoresTheStudyTracksWhenPackingFails() throws IOException {
    original("ori.midi", "uploaded-midi");
    doThrow(new RuntimeException("Error during packing")).when(scoreService)
      .packAttachmentToScore(any(), anyString(), any(), any());

    assertThrows(RuntimeException.class, () -> scoreService.reimportMidi(score, List.of(4), true));
    assertEquals("0,1", score.getStudyTracks());
  }

  @Test
  void reimportMidi_refusesInvalidStudyTracksBeforeReadingTheOriginal() throws IOException {
    for (List<Integer> tracks : Arrays.asList(null, List.<Integer>of(), List.of(0, 1, 2), List.of(-1), List.of(2, 2),
      Arrays.asList(1, null))) {
      assertThrows(IllegalArgumentException.class, () -> scoreService.reimportMidi(score, tracks, true), String.valueOf(tracks));
    }
    verify(scoreService, never()).getOriginalFromScore(any());
    assertEquals("0,1", score.getStudyTracks());
  }

  @Test
  void isMidiFilename() {
    assertTrue(ScoreService.isMidiFilename("ori.midi"));
    assertTrue(ScoreService.isMidiFilename("ori.MID"));
    assertFalse(ScoreService.isMidiFilename("ori.musicxml"));
    assertFalse(ScoreService.isMidiFilename("ori.pdf"));
  }
}
