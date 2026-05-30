package org.pianoml.backend.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.YoutubeRank;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.model.YoutubeVideoApiInfo;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.pianoml.backend.service.YoutubeService;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Tests for ScoreController.scoreYoutubeEdit and scoreIdVideoGet
 */
public class ScoreControllerYoutubeApiTest {

  private MockMvc mockMvc;

  private ScoreService scoreService;
  private YoutubeService youtubeService;
  private UserRepository userRepository;
  private ScoreRepository scoreRepository;
  private AccountService accountService;
  private YoutubeRankRepository youtubeRankRepository;

  @BeforeEach
  void setup() {
    scoreService = mock(ScoreService.class);
    youtubeService = mock(YoutubeService.class);
    userRepository = mock(UserRepository.class);
    scoreRepository = mock(ScoreRepository.class);
    accountService = mock(AccountService.class);
    youtubeRankRepository = mock(YoutubeRankRepository.class);

    ScoreController controller = new ScoreController(
        scoreService, youtubeService, userRepository, accountService, scoreRepository, youtubeRankRepository);

    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // scoreIdVideoGet  GET /score/{id}/video
  // ─────────────────────────────────────────────────────────────────────────

  @Test
  void videoGet_scoreNotFound_returns404() throws Exception {
    UUID scoreId = UUID.randomUUID();
    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.empty());

    mockMvc.perform(get("/score/{id}/video", scoreId))
        .andExpect(status().isNotFound());
  }

  @Test
  void videoGet_youtubeReturnsVideos_returns200WithList() throws Exception {
    UUID scoreId = UUID.randomUUID();

    ScoreApiInfo scoreApiInfo = new ScoreApiInfo();
    scoreApiInfo.setTitle("Moonlight Sonata");
    scoreApiInfo.setAuthor("Beethoven");

    YoutubeVideoApiInfo video1 = new YoutubeVideoApiInfo();
    video1.setVideoId("abc123");
    video1.setTitle("Moonlight Sonata Piano Tutorial");
    video1.setChannelTitle("PianoChannel");

    YoutubeVideoApiInfo video2 = new YoutubeVideoApiInfo();
    video2.setVideoId("xyz789");
    video2.setTitle("Beethoven Moonlight Sonata - Piano");
    video2.setChannelTitle("ClassicalPiano");

    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.of(scoreApiInfo));
    when(youtubeService.searchVideos(eq("Moonlight Sonata"), eq("Beethoven")))
        .thenReturn(List.of(video1, video2));

    mockMvc.perform(get("/score/{id}/video", scoreId))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].videoId").value("abc123"))
        .andExpect(jsonPath("$[0].title").value("Moonlight Sonata Piano Tutorial"))
        .andExpect(jsonPath("$[1].videoId").value("xyz789"));
  }

  @Test
  void videoGet_youtubeThrowsException_returns502() throws Exception {
    UUID scoreId = UUID.randomUUID();

    ScoreApiInfo scoreApiInfo = new ScoreApiInfo();
    scoreApiInfo.setTitle("Clair de Lune");
    scoreApiInfo.setAuthor("Debussy");

    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.of(scoreApiInfo));
    when(youtubeService.searchVideos(any(), any()))
        .thenThrow(new YoutubeService.YoutubeApiException("API error", new RuntimeException()));

    mockMvc.perform(get("/score/{id}/video", scoreId))
        .andExpect(status().isBadGateway());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // scoreYoutubeEdit  POST /score/{id}/video/{youtube_id}/{action}
  // ─────────────────────────────────────────────────────────────────────────

  @Test
  void youtubeEdit_scoreNotFound_returns404() throws Exception {
    UUID scoreId = UUID.randomUUID();
    when(scoreRepository.findById(eq(scoreId))).thenReturn(Optional.empty());

    mockMvc.perform(post("/score/{id}/video/{youtube_id}/{action}", scoreId, "vid123", "upvote")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isNotFound());
  }

  @Test
  void youtubeEdit_unknownAction_returns400() throws Exception {
    UUID scoreId = UUID.randomUUID();
    Score score = new Score();
    score.setId(scoreId);
    when(scoreRepository.findById(eq(scoreId))).thenReturn(Optional.of(score));

    YoutubeRank rank = new YoutubeRank(scoreId, "vid123");
    when(youtubeRankRepository.findByScoreIdAndVideoId(eq(scoreId), eq("vid123")))
        .thenReturn(Optional.of(rank));

    mockMvc.perform(post("/score/{id}/video/{youtube_id}/{action}", scoreId, "vid123", "unknown_action")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isBadRequest());
  }

  @Test
  void youtubeEdit_upvote_incrementsRankAndReturns200() throws Exception {
    UUID scoreId = UUID.randomUUID();
    Score score = new Score();
    score.setId(scoreId);

    ScoreApiInfo scoreApiInfo = new ScoreApiInfo();
    scoreApiInfo.setId(scoreId.toString());

    when(scoreRepository.findById(eq(scoreId))).thenReturn(Optional.of(score));
    when(youtubeRankRepository.findByScoreIdAndVideoId(eq(scoreId), eq("vid123")))
        .thenReturn(Optional.of(new YoutubeRank(scoreId, "vid123")));
    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.of(scoreApiInfo));

    mockMvc.perform(post("/score/{id}/video/{youtube_id}/{action}", scoreId, "vid123", "upvote")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk());

    verify(youtubeRankRepository).incrementRank(eq(scoreId), eq("vid123"));
    verify(youtubeRankRepository, never()).decrementRank(any(), any());
    verify(youtubeRankRepository, never()).incrementViews(any(), any());
    verify(youtubeRankRepository, never()).incrementReports(any(), any());
  }

  @Test
  void youtubeEdit_downvote_decrementsRankAndReturns200() throws Exception {
    UUID scoreId = UUID.randomUUID();
    Score score = new Score();
    score.setId(scoreId);

    ScoreApiInfo scoreApiInfo = new ScoreApiInfo();
    scoreApiInfo.setId(scoreId.toString());

    when(scoreRepository.findById(eq(scoreId))).thenReturn(Optional.of(score));
    when(youtubeRankRepository.findByScoreIdAndVideoId(eq(scoreId), eq("vid456")))
        .thenReturn(Optional.of(new YoutubeRank(scoreId, "vid456")));
    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.of(scoreApiInfo));

    mockMvc.perform(post("/score/{id}/video/{youtube_id}/{action}", scoreId, "vid456", "downvote")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk());

    verify(youtubeRankRepository).decrementRank(eq(scoreId), eq("vid456"));
    verify(youtubeRankRepository, never()).incrementRank(any(), any());
  }

  @Test
  void youtubeEdit_view_incrementsViewsAndReturns200() throws Exception {
    UUID scoreId = UUID.randomUUID();
    Score score = new Score();
    score.setId(scoreId);

    ScoreApiInfo scoreApiInfo = new ScoreApiInfo();
    scoreApiInfo.setId(scoreId.toString());

    when(scoreRepository.findById(eq(scoreId))).thenReturn(Optional.of(score));
    when(youtubeRankRepository.findByScoreIdAndVideoId(eq(scoreId), eq("vid789")))
        .thenReturn(Optional.of(new YoutubeRank(scoreId, "vid789")));
    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.of(scoreApiInfo));

    mockMvc.perform(post("/score/{id}/video/{youtube_id}/{action}", scoreId, "vid789", "view")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk());

    verify(youtubeRankRepository).incrementViews(eq(scoreId), eq("vid789"));
    verify(youtubeRankRepository, never()).incrementRank(any(), any());
    verify(youtubeRankRepository, never()).incrementReports(any(), any());
  }

  @Test
  void youtubeEdit_report_incrementsReportsAndReturns200() throws Exception {
    UUID scoreId = UUID.randomUUID();
    Score score = new Score();
    score.setId(scoreId);

    ScoreApiInfo scoreApiInfo = new ScoreApiInfo();
    scoreApiInfo.setId(scoreId.toString());

    when(scoreRepository.findById(eq(scoreId))).thenReturn(Optional.of(score));
    when(youtubeRankRepository.findByScoreIdAndVideoId(eq(scoreId), eq("vid000")))
        .thenReturn(Optional.of(new YoutubeRank(scoreId, "vid000")));
    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.of(scoreApiInfo));

    mockMvc.perform(post("/score/{id}/video/{youtube_id}/{action}", scoreId, "vid000", "report")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk());

    verify(youtubeRankRepository).incrementReports(eq(scoreId), eq("vid000"));
    verify(youtubeRankRepository, never()).incrementRank(any(), any());
    verify(youtubeRankRepository, never()).incrementViews(any(), any());
  }

  @Test
  void youtubeEdit_firstInteraction_createsRowThenAppliesAction() throws Exception {
    UUID scoreId = UUID.randomUUID();
    Score score = new Score();
    score.setId(scoreId);

    ScoreApiInfo scoreApiInfo = new ScoreApiInfo();
    scoreApiInfo.setId(scoreId.toString());

    YoutubeRank newRow = new YoutubeRank(scoreId, "newVid");

    when(scoreRepository.findById(eq(scoreId))).thenReturn(Optional.of(score));
    // First call returns empty → triggers creation
    when(youtubeRankRepository.findByScoreIdAndVideoId(eq(scoreId), eq("newVid")))
        .thenReturn(Optional.empty());
    when(youtubeRankRepository.save(any(YoutubeRank.class))).thenReturn(newRow);
    when(scoreService.getScore(eq(scoreId))).thenReturn(Optional.of(scoreApiInfo));

    mockMvc.perform(post("/score/{id}/video/{youtube_id}/{action}", scoreId, "newVid", "upvote")
            .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk());

    verify(youtubeRankRepository).save(any(YoutubeRank.class));
    verify(youtubeRankRepository).incrementRank(eq(scoreId), eq("newVid"));
  }
}

