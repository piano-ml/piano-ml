package org.pianoml.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.model.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.service.ScoreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Collections;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;


@WebMvcTest(ScoreController.class)
public class ScoreControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ScoreService scoreService;

    @MockBean
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    public void testGetScoreById() throws Exception {
        UUID scoreId = UUID.randomUUID();
        ScoreApiInfo score = new ScoreApiInfo();
        score.setId(scoreId.toString());
        score.setTitle("My Score");

        given(scoreService.getScore(scoreId)).willReturn(Optional.of(score));

        mockMvc.perform(get("/score/{id}", scoreId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(scoreId.toString()))
                .andExpect(jsonPath("$.title").value("My Score"));
    }

    @Test
    @WithMockUser(username = "test@example.com")
    public void testCreateScore() throws Exception {
        ScoreApiInfo scoreToCreate = new ScoreApiInfo();
        scoreToCreate.setTitle("New Score");

        ScoreApiInfo createdScore = new ScoreApiInfo();
        createdScore.setId(UUID.randomUUID().toString());
        createdScore.setTitle("New Score");

        User mockUser = new User();
        mockUser.setId(UUID.randomUUID());
        given(userRepository.findByEmail("test@example.com")).willReturn(Optional.of(mockUser));
        given(scoreService.createScore(any(ScoreApiInfo.class), any(String.class))).willReturn(createdScore);

        mockMvc.perform(post("/score").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(scoreToCreate)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.title").value("New Score"));
    }

    @Test
    public void testUpdateScore() throws Exception {
        UUID scoreId = UUID.randomUUID();
        ScoreApiInfo scoreToUpdate = new ScoreApiInfo();
        scoreToUpdate.setTitle("Updated Score");

        ScoreApiInfo updatedScore = new ScoreApiInfo();
        updatedScore.setId(scoreId.toString());
        updatedScore.setTitle("Updated Score");

        given(scoreService.updateScore(any(UUID.class), any(ScoreApiInfo.class))).willReturn(Optional.of(updatedScore));

        mockMvc.perform(put("/score/{id}", scoreId).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(scoreToUpdate)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(scoreId.toString()))
                .andExpect(jsonPath("$.title").value("Updated Score"));
    }

    @Test
    public void testSearchScores() throws Exception {
        ScoreApiInfo score = new ScoreApiInfo();
        score.setId(UUID.randomUUID().toString());
        score.setTitle("Test Score");

        given(scoreService.searchScores(any(), any(), any(), any(), any(), any()))
                .willReturn(Collections.singletonList(score));

        mockMvc.perform(get("/score/search?keyword=Test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Test Score"));
    }

    @Test
    public void testGetScoreAttachmentNotImplemented() throws Exception {
        mockMvc.perform(get("/score/{id}/{type}", UUID.randomUUID(), "midi"))
                .andExpect(status().isNotImplemented());
    }

     @Test
    public void testUploadScoreAttachmentNotImplemented() throws Exception {
        mockMvc.perform(post("/score/{id}/{type}", UUID.randomUUID(), "midi").with(csrf()))
                .andExpect(status().isNotImplemented());
    }
}
