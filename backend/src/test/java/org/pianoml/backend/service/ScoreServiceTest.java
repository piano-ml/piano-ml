package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.mapper.ScoreMapper;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.ScoreRepository;

import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class ScoreServiceTest {

  @Mock
  private ScoreRepository scoreRepository;

  @Mock
  private ScoreMapper scoreMapper;

  @InjectMocks
  private ScoreService scoreService;

  @Test
  void updateScore_updatesStudyTracks() {
    UUID id = UUID.randomUUID();
    Score existing = new Score();
    existing.setId(id);
    existing.setStudyTracks(null);

    when(scoreRepository.findById(id)).thenReturn(Optional.of(existing));
    when(scoreRepository.save(any(Score.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(scoreMapper.toScoreApiInfo(any(Score.class))).thenReturn(new ScoreApiInfo());

    ScoreApiInfo dto = new ScoreApiInfo();
    dto.setTitle("new title");
    dto.setStudyTracks(Arrays.asList(1, 3, 5));

    Optional<ScoreApiInfo> result = scoreService.updateScore(id, dto);

    assertTrue(result.isPresent());

    ArgumentCaptor<Score> captor = ArgumentCaptor.forClass(Score.class);
    verify(scoreRepository).save(captor.capture());
    Score saved = captor.getValue();
    assertEquals("1,3,5", saved.getStudyTracks());
  }

  @Test
  void updateScore_handlesNullStudyTracks() {
    UUID id = UUID.randomUUID();
    Score existing = new Score();
    existing.setId(id);
    existing.setStudyTracks("1,2");

    when(scoreRepository.findById(id)).thenReturn(Optional.of(existing));
    when(scoreRepository.save(any(Score.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(scoreMapper.toScoreApiInfo(any(Score.class))).thenReturn(new ScoreApiInfo());

    ScoreApiInfo dto = new ScoreApiInfo();
    dto.setTitle("keep title");
    dto.setStudyTracks(null); // expect empty string via mapper util

    Optional<ScoreApiInfo> result = scoreService.updateScore(id, dto);

    assertTrue(result.isPresent());

    ArgumentCaptor<Score> captor = ArgumentCaptor.forClass(Score.class);
    verify(scoreRepository).save(captor.capture());
    Score saved = captor.getValue();
    assertEquals("", saved.getStudyTracks());
  }
}

