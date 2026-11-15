package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.exception.UserNotLoggedInException;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.pianoml.backend.service.YoutubeService;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** POST /score/{id}/reimport: re-import a MIDI score from its original upload, owner and admins only. */
class ScoreControllerReimportApiTest {

  private static final String URL = "/score/{id}/reimport";

  private MockMvc mockMvc;
  private ScoreService scoreService;
  private ScoreRepository scoreRepository;
  private AccountService accountService;

  @BeforeEach
  void setup() {
    scoreService = mock(ScoreService.class);
    scoreRepository = mock(ScoreRepository.class);
    accountService = mock(AccountService.class);
    ScoreController controller = new ScoreController(scoreService, mock(YoutubeService.class), mock(UserRepository.class),
      accountService, scoreRepository, mock(YoutubeRankRepository.class));
    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  private static User user(String roles) {
    User user = new User();
    user.setId(UUID.randomUUID());
    user.setRoles(roles);
    return user;
  }

  private Score scoreOwnedBy(User owner) {
    Score score = new Score();
    score.setOwner(owner);
    score.setId(UUID.randomUUID());
    score.setVersion(1);
    score.setImmutableSlug("fox-toby-my-castle-town");
    when(scoreRepository.findById(score.getId())).thenReturn(Optional.of(score));
    return score;
  }

  private void loggedInAs(User user) {
    SecurityContext context = mock(SecurityContext.class);
    Authentication auth = mock(Authentication.class);
    when(context.getAuthentication()).thenReturn(auth);
    SecurityContextHolder.setContext(context);
    when(accountService.getUserFromAuthentication(auth)).thenReturn(user);
  }

  private void anonymous() {
    SecurityContext context = mock(SecurityContext.class);
    Authentication auth = mock(Authentication.class);
    when(context.getAuthentication()).thenReturn(auth);
    SecurityContextHolder.setContext(context);
    when(accountService.getUserFromAuthentication(auth)).thenThrow(new UserNotLoggedInException("user not logged in"));
  }

  private void reimportSucceeds(Score score) throws Exception {
    when(scoreService.reimportMidi(same(score), anyList(), any())).thenReturn(Optional.of(score));
    ScoreApiInfo info = new ScoreApiInfo();
    info.setId(score.getId().toString());
    info.setImmutableSlug(score.getImmutableSlug());
    info.setStudyTracks(List.of(2, 1));
    when(scoreService.getScore(score.getId())).thenReturn(Optional.of(info));
  }

  private static final String BODY = "{\"study_tracks\":[2,1],\"make_fingering\":false}";

  @Test
  void owner_reimportsWithTheChosenTracks() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(owner);
    reimportSucceeds(score);

    mockMvc.perform(post(URL, score.getId()).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.id").value(score.getId().toString()))
      .andExpect(jsonPath("$.immutableSlug").value("fox-toby-my-castle-town"));
    verify(scoreService).reimportMidi(same(score), eq(List.of(2, 1)), eq(false));
  }

  @Test
  void admin_reimportsAnotherUsersScore() throws Exception {
    Score score = scoreOwnedBy(user("USER"));
    loggedInAs(user("USER,ADMIN"));
    reimportSucceeds(score);

    mockMvc.perform(post(URL, score.getId()).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isOk());
  }

  @Test
  void otherUser_forbidden() throws Exception {
    Score score = scoreOwnedBy(user("USER"));
    loggedInAs(user("USER"));

    mockMvc.perform(post(URL, score.getId()).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isForbidden());
    verify(scoreService, never()).reimportMidi(any(), anyList(), any());
  }

  @Test
  void anonymous_unauthorized() throws Exception {
    Score score = scoreOwnedBy(user("USER"));
    anonymous();

    mockMvc.perform(post(URL, score.getId()).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isUnauthorized());
    verify(scoreService, never()).reimportMidi(any(), anyList(), any());
  }

  @Test
  void unknownOrDeletedScore_notFound() throws Exception {
    User owner = user("USER");
    loggedInAs(owner);
    UUID unknown = UUID.randomUUID();
    when(scoreRepository.findById(unknown)).thenReturn(Optional.empty());
    mockMvc.perform(post(URL, unknown).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isNotFound());

    Score deleted = scoreOwnedBy(owner);
    deleted.setDeleted(true);
    mockMvc.perform(post(URL, deleted.getId()).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isNotFound());

    mockMvc.perform(post(URL, "not-a-uuid").contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isNotFound());
  }

  @Test
  void noOriginalUpload_notFound() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(owner);
    when(scoreService.reimportMidi(same(score), anyList(), any())).thenReturn(Optional.empty());

    mockMvc.perform(post(URL, score.getId()).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isNotFound());
  }

  @Test
  void originalNotMidi_badRequest() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(owner);
    when(scoreService.reimportMidi(same(score), anyList(), any()))
      .thenThrow(new IllegalArgumentException("Only scores imported from a MIDI file can be re-imported"));

    mockMvc.perform(post(URL, score.getId()).contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isBadRequest());
  }
}
