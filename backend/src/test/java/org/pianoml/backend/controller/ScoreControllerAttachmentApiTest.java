package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.exception.UserNotLoggedInException;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.pianoml.backend.security.JwtTokenProvider;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests for ScoreController.scoreOwnerMbidTypeVersionRevisionGet
 */
public class ScoreControllerAttachmentApiTest {

  private MockMvc mockMvc;

  private ScoreService scoreService;
  private YoutubeService youtubeService;
  private UserRepository userRepository;
  private ScoreRepository scoreRepository;
  private AccountService accountService;
  private YoutubeRankRepository youtubeRankRepository;

  private ScoreController controller;

  @BeforeEach
  void setup() {
    scoreService = Mockito.mock(ScoreService.class);
    youtubeService = Mockito.mock(YoutubeService.class);
    userRepository = Mockito.mock(UserRepository.class);
    scoreRepository = Mockito.mock(ScoreRepository.class);
    accountService = Mockito.mock(AccountService.class);
    youtubeRankRepository = Mockito.mock(YoutubeRankRepository.class);

    controller = new ScoreController(scoreService, youtubeService, userRepository, accountService, scoreRepository, youtubeRankRepository);
    // Inject mocks into controller's fields
    ReflectionTestUtils.setField(controller, "scoreService", scoreService);
    ReflectionTestUtils.setField(controller, "userRepository", userRepository);
    ReflectionTestUtils.setField(controller, "userService", accountService);
    ReflectionTestUtils.setField(controller, "scoreRepository", scoreRepository);
    ReflectionTestUtils.setField(controller, "youtubeRankRepository", youtubeRankRepository);

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

  // ── type "original": the file uploaded at import, owner and admin only ──

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  private static final String URL = "/score/{owner}/{id}/{type}/{version}/{revision}";

  private Score scoreOwnedBy(User owner) {
    Score score = new Score();
    score.setOwner(owner);
    score.setId(UUID.randomUUID());
    score.setVersion(1);
    score.setImmutableSlug("fox-toby-my-castle-town");
    when(userRepository.findById(eq(owner.getId()))).thenReturn(Optional.of(owner));
    when(scoreRepository.findScoreByIdAndOwnerAndVersion(eq(score.getId()), eq(owner), eq(1)))
      .thenReturn(Optional.of(score));
    return score;
  }

  private static User user(String roles) {
    User user = new User();
    user.setId(UUID.randomUUID());
    user.setRoles(roles);
    return user;
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

  @Test
  void original_owner_getsFileWithItsContentTypeAndName() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(owner);
    byte[] payload = "%PDF-uploaded".getBytes();
    when(scoreService.getOriginalFromScore(eq(score))).thenReturn(Optional.of(new ScoreService.ScoreFile("ori.pdf", payload)));

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "original", 1, 1))
      .andExpect(status().isOk())
      .andExpect(content().contentType(MediaType.APPLICATION_PDF))
      .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")))
      .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("fox-toby-my-castle-town-original.pdf")))
      .andExpect(content().bytes(payload));
  }

  @Test
  void original_admin_getsFile() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(user("USER,ADMIN"));
    byte[] payload = "MThd".getBytes();
    when(scoreService.getOriginalFromScore(eq(score))).thenReturn(Optional.of(new ScoreService.ScoreFile("ori.midi", payload)));

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "original", 1, 1))
      .andExpect(status().isOk())
      .andExpect(content().contentType(MediaType.parseMediaType("audio/midi")))
      .andExpect(content().bytes(payload));
  }

  @Test
  void original_mxlUpload_servedAsCompressedMusicXml() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(owner);
    when(scoreService.getOriginalFromScore(eq(score))).thenReturn(Optional.of(new ScoreService.ScoreFile("ori.mxl", new byte[]{1})));

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "original", 1, 1))
      .andExpect(status().isOk())
      .andExpect(content().contentType(MediaType.parseMediaType("application/vnd.recordare.musicxml")));
  }

  @Test
  void original_otherUser_forbidden() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(user("USER"));

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "original", 1, 1))
      .andExpect(status().isForbidden());
    verify(scoreService, never()).getOriginalFromScore(any());
  }

  @Test
  void original_anonymous_unauthorized() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    anonymous();

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "original", 1, 1))
      .andExpect(status().isUnauthorized());
    verify(scoreService, never()).getOriginalFromScore(any());
  }

  @Test
  void original_noAuthenticationAtAll_unauthorized() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    SecurityContextHolder.clearContext();

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "original", 1, 1))
      .andExpect(status().isUnauthorized());
    verify(scoreService, never()).getOriginalFromScore(any());
  }

  @Test
  void original_notKeptForThisScore_returns404() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    loggedInAs(owner);
    when(scoreService.getOriginalFromScore(eq(score))).thenReturn(Optional.empty());

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "original", 1, 1))
      .andExpect(status().isNotFound());
  }

  @Test
  void generatedFiles_stillPublic_noLoginNeeded() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    SecurityContextHolder.clearContext();
    when(scoreService.getAttachmentFromScore(eq(score), eq("pdf"))).thenReturn(Optional.of(new byte[]{1}));

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "pdf", 1, 1))
      .andExpect(status().isOk())
      .andExpect(content().contentType(MediaType.APPLICATION_PDF));
  }

  @Test
  void generatedFile_isAnAttachmentNamedAfterTheSlug() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    when(scoreService.getAttachmentFromScore(eq(score), eq("midi"))).thenReturn(Optional.of(new byte[]{1, 2}));

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "midi", 1, 1))
      .andExpect(status().isOk())
      .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment;")))
      .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("filename=\"fox-toby-my-castle-town.mid\"")));
  }

  @Test
  void unknownType_badRequest_withoutLookingTheScoreUp() throws Exception {
    mockMvc.perform(get(URL, UUID.randomUUID(), UUID.randomUUID(), "metadata.json", 1, 1))
      .andExpect(status().isBadRequest());
    verify(scoreRepository, never()).findScoreByIdAndOwnerAndVersion(any(), any(), any());
  }

  @Test
  void downloadBaseName_slugElseId() {
    Score score = new Score();
    score.setId(UUID.randomUUID());
    org.junit.jupiter.api.Assertions.assertEquals(score.getId().toString(), ScoreController.downloadBaseName(score));
    score.setImmutableSlug("  ");
    org.junit.jupiter.api.Assertions.assertEquals(score.getId().toString(), ScoreController.downloadBaseName(score));
    score.setImmutableSlug("fox-toby-my-castle-town");
    org.junit.jupiter.api.Assertions.assertEquals("fox-toby-my-castle-town", ScoreController.downloadBaseName(score));
  }

  @Test
  void copyrightedPdf_ownerOnly() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    score.setPublicDomain(false);
    when(scoreService.getAttachmentFromScore(eq(score), eq("pdf"))).thenReturn(Optional.of(new byte[]{1}));

    anonymous();
    mockMvc.perform(get(URL, owner.getId(), score.getId(), "pdf", 1, 1)).andExpect(status().isUnauthorized());
    loggedInAs(user("USER"));
    mockMvc.perform(get(URL, owner.getId(), score.getId(), "pdf", 1, 1)).andExpect(status().isForbidden());
    verify(scoreService, never()).getAttachmentFromScore(any(), any());
    loggedInAs(owner);
    mockMvc.perform(get(URL, owner.getId(), score.getId(), "pdf", 1, 1)).andExpect(status().isOk());
  }

  @Test
  void copyrightedMidi_stillOpen() throws Exception {
    User owner = user("USER");
    Score score = scoreOwnedBy(owner);
    score.setPublicDomain(false);
    SecurityContextHolder.clearContext();
    when(scoreService.getAttachmentFromScore(eq(score), eq("midi"))).thenReturn(Optional.of(new byte[]{1}));

    mockMvc.perform(get(URL, owner.getId(), score.getId(), "midi", 1, 1)).andExpect(status().isOk());
  }
}
