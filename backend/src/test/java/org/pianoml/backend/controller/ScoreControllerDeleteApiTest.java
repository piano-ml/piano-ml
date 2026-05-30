package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.pianoml.backend.service.YoutubeService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class ScoreControllerDeleteApiTest {

  private MockMvc mockMvc;
  private ScoreService scoreService;
  private AccountService accountService;
  private UserRepository userRepository;
  private ScoreRepository scoreRepository;
  private YoutubeService youtubeService;
  private YoutubeRankRepository youtubeRankRepository;

  @BeforeEach
  void setup() {
    scoreService = mock(ScoreService.class);
    userRepository = mock(UserRepository.class);
    scoreRepository = mock(ScoreRepository.class);
    accountService = mock(AccountService.class);
    youtubeService = mock(YoutubeService.class);
    youtubeRankRepository = mock(YoutubeRankRepository.class);

    ScoreController controller = new ScoreController(scoreService, youtubeService, userRepository, accountService, scoreRepository, youtubeRankRepository);
    ReflectionTestUtils.setField(controller, "scoreService", scoreService);
    ReflectionTestUtils.setField(controller, "userService", accountService);

    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  @AfterEach
  void cleanup() {
    SecurityContextHolder.clearContext();
  }

  private Authentication withAuth(User user) {
    SecurityContext context = mock(SecurityContext.class);
    Authentication auth = mock(Authentication.class);
    when(context.getAuthentication()).thenReturn(auth);
    SecurityContextHolder.setContext(context);
    when(accountService.getUserFromAuthentication(auth)).thenReturn(user);
    return auth;
  }

  @Test
  void delete_ok_returns204() throws Exception {
    UUID scoreId = UUID.randomUUID();
    User user = new User();
    user.setId(UUID.randomUUID());
    withAuth(user);

    when(scoreService.deleteScore(eq(scoreId), eq(user))).thenReturn(true);

    mockMvc.perform(delete("/score/{id}/info", scoreId))
      .andExpect(status().isNoContent());

    verify(scoreService).deleteScore(eq(scoreId), eq(user));
  }

  @Test
  void delete_notFound_returns404() throws Exception {
    UUID scoreId = UUID.randomUUID();
    User user = new User();
    user.setId(UUID.randomUUID());
    withAuth(user);

    when(scoreService.deleteScore(eq(scoreId), eq(user))).thenReturn(false);

    mockMvc.perform(delete("/score/{id}/info", scoreId))
      .andExpect(status().isNotFound());
  }

  @Test
  void delete_forbidden_returns403() throws Exception {
    UUID scoreId = UUID.randomUUID();
    User user = new User();
    user.setId(UUID.randomUUID());
    withAuth(user);

    when(scoreService.deleteScore(eq(scoreId), eq(user)))
      .thenThrow(new RuntimeException("Unauthorized: Only owner or admin can delete this score"));

    mockMvc.perform(delete("/score/{id}/info", scoreId))
      .andExpect(status().isForbidden());
  }
}

