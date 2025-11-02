package org.pianoml.backend.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests for ScoreController.scoreOwnerMbidTypeVersionRevisionGet
 */
public class ScoreControllerAttachmentApiTest {

  private MockMvc mockMvc;

  private ScoreService scoreService;
  private UserRepository userRepository;
  private ScoreRepository scoreRepository;
  private AccountService accountService;

  private ScoreController controller;

  @BeforeEach
  void setup() {
    scoreService = Mockito.mock(ScoreService.class);
    userRepository = Mockito.mock(UserRepository.class);
    scoreRepository = Mockito.mock(ScoreRepository.class);
    accountService = Mockito.mock(AccountService.class);

    controller = new ScoreController();
    // Inject mocks into controller's fields
    ReflectionTestUtils.setField(controller, "scoreService", scoreService);
    ReflectionTestUtils.setField(controller, "userRepository", userRepository);
    ReflectionTestUtils.setField(controller, "userService", accountService);
    ReflectionTestUtils.setField(controller, "scoreRepository", scoreRepository);
    //ReflectionTestUtils.setField(controller, "tokenProvider", jwtTokenProvider);

    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  @Test
  void getAttachment_ok_returnsBytes() throws Exception {
    // Arrange
    UUID ownerId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0; // unused in controller
    String type = "midi";

    User owner = new User();
    owner.setId(ownerId);

    Score score = new Score();
    score.setOwner(owner);
    score.setId(id);
    score.setVersion(version);

    byte[] payload = "test-midi".getBytes();

    when(userRepository.findById(eq(ownerId))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(owner), eq(version)))
      .thenReturn(Optional.of(score));
    when(scoreService.getAttachmentFromScore(eq(score), eq(type))).thenReturn(Optional.of(payload));

    // Act + Assert
    mockMvc.perform(get("/score/{owner}/{mbid}/{type}/{version}/{revision}", ownerId, id, type, version, revision))
      .andExpect(status().isOk())
      .andExpect(content().contentType(MediaType.parseMediaType("audio/midi")))
      .andExpect(content().bytes(payload));
  }

  @Test
  void getAttachment_scoreNotFound_returns404() throws Exception {
    // Arrange
    UUID ownerId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0;
    String type = "midi";

    User owner = new User();
    owner.setId(ownerId);

    when(userRepository.findById(eq(ownerId))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(owner), eq(version)))
      .thenReturn(Optional.empty());

    // Act + Assert
    mockMvc.perform(get("/score/{owner}/{id}/{type}/{version}/{revision}", ownerId, id, type, version, revision))
      .andExpect(status().isNotFound());
  }

  @Test
  void getAttachment_attachmentMissing_returns404() throws Exception {
    // Arrange
    UUID ownerId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0;
    String type = "midi";

    User owner = new User();
    owner.setId(ownerId);

    Score score = new Score();
    score.setOwner(owner);
    score.setMbid(id);
    score.setVersion(version);

    when(userRepository.findById(eq(ownerId))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(owner), eq(version)))
      .thenReturn(Optional.of(score));
    when(scoreService.getAttachmentFromScore(eq(score), eq(type))).thenReturn(Optional.empty());

    // Act + Assert
    mockMvc.perform(get("/score/{owner}/{id}/{type}/{version}/{revision}", ownerId, id, type, version, revision))
      .andExpect(status().isNotFound());
  }
}

