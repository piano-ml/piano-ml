package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.WorkloadRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.pianoml.backend.service.YoutubeService;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.UUID;

import org.mockito.ArgumentCaptor;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests for ScoreController.scoreMbidTypeVersionRevisionPost
 */
public class ScoreControllerUploadApiTest {

  private MockMvc mockMvc;

  private ScoreService scoreService;
  private UserRepository userRepository;
  private ScoreRepository scoreRepository;


  @BeforeEach
  void setup() {
    scoreService = mock(ScoreService.class);
    userRepository = mock(UserRepository.class);
    scoreRepository = mock(ScoreRepository.class);
    AccountService accountService = mock(AccountService.class);
    YoutubeService youtubeService = mock(YoutubeService.class);
    YoutubeRankRepository youtubeRankRepository = mock(YoutubeRankRepository.class);

    ScoreController controller = new ScoreController(scoreService, youtubeService, userRepository, accountService, scoreRepository, youtubeRankRepository);
    // Inject mocks
    ReflectionTestUtils.setField(controller, "scoreService", scoreService);
    ReflectionTestUtils.setField(controller, "userRepository", userRepository);
    ReflectionTestUtils.setField(controller, "userService", accountService);
    ReflectionTestUtils.setField(controller, "scoreRepository", scoreRepository);
    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  @AfterEach
  void cleanup() {
    SecurityContextHolder.clearContext();
  }

  private void withAuth(UUID userId) {
    SecurityContext context = mock(SecurityContext.class);
    Authentication auth = mock(Authentication.class);
    when(auth.getName()).thenReturn(userId.toString());
    when(context.getAuthentication()).thenReturn(auth);
    SecurityContextHolder.setContext(context);
  }

  @Test
  void upload_midi_ok_returns200() throws Exception {
    // Arrange
    UUID ownerId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0; // ignored by controller
    String type = "midi";
    byte[] body = "dummy-midi".getBytes();

    withAuth(ownerId);

    User owner = new User();
    owner.setId(ownerId);

    Score score = new Score();
    score.setOwner(owner);
    score.setMbid(id);
    score.setVersion(version);

    when(userRepository.findById(eq(ownerId))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(owner), eq(version)))
      .thenReturn(Optional.of(score));
    // stub accepting any value for the makeFingering parameter to avoid brittle equality checks
    doNothing().when(scoreService).packAttachmentToScore(eq(score), eq(type), any(), any());

    // Act + Assert
    mockMvc.perform(post("/score/{mbid}/{type}/{version}/{revision}", id, type, version, revision)
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .content(body))
      .andExpect(status().isOk());
  }


  @Test
  void upload_pdf_ok_returns200() throws Exception {
    // Arrange
    UUID ownerId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0; // ignored by controller
    String type = "pdf";
    byte[] body = "dummy-midi".getBytes();

    withAuth(ownerId);

    User owner = new User();
    owner.setId(ownerId);

    Score score = new Score();
    score.setOwner(owner);
    score.setMbid(id);
    score.setVersion(version);

    when(userRepository.findById(eq(ownerId))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(owner), eq(version)))
      .thenReturn(Optional.of(score));
    // controller may pass null for the makeFingering parameter depending on request handling;
    // stub and verify accepting any() for the 4th arg to avoid brittle equality checks
    doNothing().when(scoreService).packAttachmentToScore(eq(score), eq(type), any(), any());

    // Act + Assert
    //  null, null, makeFingering
    mockMvc.perform(post("/score/{mbid}/{type}/{version}/{revision}", id, type, version, revision)
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .param("track1", "1")
        .param("track2", "2")
        .param("makeFingering", "true")
        .content(body))
      .andExpect(status().isOk());

    // Verify scoreService.packAttachmentToScore was called exactly once
    verify(scoreService, times(1)).packAttachmentToScore(eq(score), eq(type), any(), eq(true));

    // Verify workloadRepository.save was called exactly once and capture the argument for later assertions
    //ArgumentCaptor<Workload> workloadCaptor = ArgumentCaptor.forClass(Workload.class);
    //verify(workloadRepository, times(1)).save(workloadCaptor.capture());
    // Log captured parameters so other assertions can inspect them later
    //System.out.println("Captured workload for PDF upload: " + workloadCaptor.getValue());
  }


  @Test
  void upload_scoreNotFound_returns404() throws Exception {
    UUID ownerId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0;
    String type = "midi";

    withAuth(ownerId);

    User owner = new User();
    owner.setId(ownerId);

    when(userRepository.findById(eq(ownerId))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(owner), eq(version)))
      .thenReturn(Optional.empty());

    mockMvc.perform(post("/score/{mbid}/{type}/{version}/{revision}", id, type, version, revision)
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .content("x".getBytes()))
      .andExpect(status().isNotFound());
  }

  @Test
  void upload_forbidden_returns403() throws Exception {
    UUID authUserId = UUID.randomUUID();
    UUID ownerId = UUID.randomUUID(); // different owner
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0;
    String type = "midi";

    withAuth(authUserId);

    User authUser = new User();
    authUser.setId(authUserId);
    User actualOwner = new User();
    actualOwner.setId(ownerId);

    Score score = new Score();
    score.setOwner(actualOwner); // owner is different from auth user
    score.setId(id);
    score.setVersion(version);

    when(userRepository.findById(eq(authUserId))).thenReturn(Optional.of(authUser));
    // Even though repository takes (mbid, authUser, version), we return a score owned by someone else to trigger 403.
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(authUser), eq(version)))
      .thenReturn(Optional.of(score));

    mockMvc.perform(post("/score/{id}/{type}/{version}/{revision}", id, type, version, revision)
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .content("x".getBytes()))
      .andExpect(status().isForbidden());
  }

  @Test
  void upload_ioError_returns500() throws Exception {
    UUID ownerId = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    int version = 1;
    int revision = 0;
    String type = "midi";
    byte[] body = "dummy".getBytes();

    withAuth(ownerId);

    User owner = new User();
    owner.setId(ownerId);

    Score score = new Score();
    score.setOwner(owner);
    score.setId(id);
    score.setVersion(version);

    when(userRepository.findById(eq(ownerId))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(id), eq(owner), eq(version)))
      .thenReturn(Optional.of(score));
    doThrow(new java.io.IOException("boom")).when(scoreService).packAttachmentToScore(eq(score), eq(type), any(), eq(null));

    mockMvc.perform(post("/score/{id}/{type}/{version}/{revision}", id, type, version, revision)
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .content(body))
      .andExpect(status().isInternalServerError());
  }
}
