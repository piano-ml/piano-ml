package org.pianoml.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class ScoreControllerCreateScoreTest {

  private MockMvc mockMvc;
  private ObjectMapper objectMapper;

  private ScoreService scoreService;
  private UserRepository userRepository;
  private ScoreRepository scoreRepository;
  private AccountService accountService;
  private JwtTokenProvider jwtTokenProvider;

  private ScoreController controller;

  @BeforeEach
  void setup() {
    scoreService = mock(ScoreService.class);
    userRepository = mock(UserRepository.class);
    scoreRepository = mock(ScoreRepository.class);
    accountService = mock(AccountService.class);
    objectMapper = new ObjectMapper();

    controller = new ScoreController();
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

  private Authentication withAuthReturningUser(User user) {
    SecurityContext context = mock(SecurityContext.class);
    Authentication auth = mock(Authentication.class);
    SecurityContextHolder.setContext(context);
    when(context.getAuthentication()).thenReturn(auth);
    when(accountService.getUserFromAuthentication(auth)).thenReturn(user);
    return auth;
  }

  @Test
  void scorePost_created_returns201_and_setsHasFilesFalseWhenNull() throws Exception {
    // Arrange
    User user = new User();
    user.setId(UUID.randomUUID());
    withAuthReturningUser(user);

    ScoreApiInfo input = new ScoreApiInfo();
    input.setTitle("New Score");
    input.setAuthorId(UUID.randomUUID().toString());
    input.setHasFiles(null); // controller should default this to false

    ScoreApiInfo created = new ScoreApiInfo();
    created.setId(UUID.randomUUID().toString());
    created.setAuthorId(UUID.randomUUID().toString());
    created.setTitle("New Score");

    when(scoreService.createScore(any(ScoreApiInfo.class), eq(user))).thenReturn(created);

    // Act + Assert
    mockMvc.perform(post("/score")
        .contentType("application/json")
        .content(objectMapper.writeValueAsBytes(input)))
      .andExpect(status().isCreated())
      .andExpect(jsonPath("$.id").value(created.getId()))
      .andExpect(jsonPath("$.title").value("New Score"));

    // Capture the argument to ensure hasFiles was set to false
    ArgumentCaptor<ScoreApiInfo> captor = ArgumentCaptor.forClass(ScoreApiInfo.class);
    verify(scoreService).createScore(captor.capture(), eq(user));
    ScoreApiInfo passed = captor.getValue();
    assertNotNull(passed);
    assertFalse(Boolean.TRUE.equals(passed.getHasFiles()));
  }


}

