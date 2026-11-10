package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserPlayCountRepository;
import org.pianoml.backend.repository.WorkloadRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ScoreServicePurgeTest {

  @Mock private ScoreRepository scoreRepository;
  @Mock private UserPlayCountRepository userPlayCountRepository;
  @Mock private YoutubeRankRepository youtubeRankRepository;
  @Mock private WorkloadRepository workloadRepository;
  @Mock private S3Client s3Client;

  @InjectMocks
  private ScoreService scoreService;

  @BeforeEach
  void bucket() {
    ReflectionTestUtils.setField(scoreService, "bucketName", "test-bucket");
  }

  private static Score score(boolean hasFiles) {
    Score score = new Score();
    score.setId(UUID.randomUUID());
    score.setTitle("t");
    User owner = new User();
    owner.setId(UUID.randomUUID());
    score.setOwner(owner);
    Author author = new Author();
    author.setName("a");
    score.setAuthor(author);
    score.setHasFiles(hasFiles);
    return score;
  }

  @Test
  void purge_removesDependentRows_theFile_thenTheScore() {
    Score score = score(true);

    scoreService.purgeScore(score);

    var order = inOrder(userPlayCountRepository, youtubeRankRepository, workloadRepository, s3Client, scoreRepository);
    order.verify(userPlayCountRepository).deleteByScoreId(score.getId());
    order.verify(youtubeRankRepository).deleteByScoreId(score.getId());
    order.verify(workloadRepository).deleteByScoreId(score.getId());
    order.verify(s3Client).deleteObject(any(DeleteObjectRequest.class));
    order.verify(scoreRepository).delete(score);
  }

  @Test
  void purge_deletesTheS3ObjectOfThisScore() {
    Score score = score(true);
    var request = org.mockito.ArgumentCaptor.forClass(DeleteObjectRequest.class);

    scoreService.purgeScore(score);

    verify(s3Client).deleteObject(request.capture());
    assertEquals("test-bucket", request.getValue().bucket());
    assertEquals(ScoreService.makeBucketKeyFromScore(score), request.getValue().key());
  }

  @Test
  void purge_withoutFiles_doesNotTouchS3() {
    Score score = score(false);

    scoreService.purgeScore(score);

    verifyNoInteractions(s3Client);
    verify(scoreRepository).delete(score);
  }

  @Test
  void purge_stillDeletesTheScoreWhenS3Fails() {
    Score score = score(true);
    when(s3Client.deleteObject(any(DeleteObjectRequest.class)))
      .thenThrow(S3Exception.builder().message("boom").build());

    scoreService.purgeScore(score);

    verify(scoreRepository).delete(score);
  }

  @Test
  void deleteScore_byOwner_purges() {
    Score score = score(false);
    when(scoreRepository.findById(score.getId())).thenReturn(java.util.Optional.of(score));
    User owner = score.getOwner();
    owner.setRoles("USER");

    assertEquals(true, scoreService.deleteScore(score.getId(), owner));

    verify(youtubeRankRepository).deleteByScoreId(score.getId());
    verify(workloadRepository).deleteByScoreId(score.getId());
    verify(scoreRepository).delete(score);
  }

  @Test
  void deleteScore_byAnotherUser_isRefused_andPurgesNothing() {
    Score score = score(false);
    when(scoreRepository.findById(score.getId())).thenReturn(java.util.Optional.of(score));
    User stranger = new User();
    stranger.setId(UUID.randomUUID());
    stranger.setRoles("USER");

    org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class,
      () -> scoreService.deleteScore(score.getId(), stranger));

    verifyNoInteractions(userPlayCountRepository, youtubeRankRepository, workloadRepository, s3Client);
    verify(scoreRepository, never()).delete(any());
  }
}
