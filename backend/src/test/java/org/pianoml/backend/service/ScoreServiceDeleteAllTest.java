package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserPlayCountRepository;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Deleting every score of an account at once (the acceptance account, see AccountService#deleteCurrentUser). */
class ScoreServiceDeleteAllTest {

  private ScoreRepository scoreRepository;
  private UserPlayCountRepository userPlayCountRepository;
  private S3Client s3Client;
  private ScoreService scoreService;
  private User owner;

  @BeforeEach
  void setUp() {
    scoreRepository = mock(ScoreRepository.class);
    userPlayCountRepository = mock(UserPlayCountRepository.class);
    s3Client = mock(S3Client.class);
    scoreService = new ScoreService();
    ReflectionTestUtils.setField(scoreService, "scoreRepository", scoreRepository);
    ReflectionTestUtils.setField(scoreService, "userPlayCountRepository", userPlayCountRepository);
    ReflectionTestUtils.setField(scoreService, "s3Client", s3Client);
    ReflectionTestUtils.setField(scoreService, "bucketName", "bucket");
    owner = new User();
    owner.setId(UUID.randomUUID());
    owner.setRoles("USER");
  }

  private ScoreRepository.StoredFilesRef stored(UUID mbid, boolean hasFiles) {
    UUID id = UUID.randomUUID();
    return new ScoreRepository.StoredFilesRef() {
      public UUID getId() { return id; }
      public UUID getMbid() { return mbid; }
      public Integer getVersion() { return 2; }
      public Boolean getHasFiles() { return hasFiles; }
    };
  }

  private DeleteObjectRequest s3Delete(String key) {
    return DeleteObjectRequest.builder().bucket("bucket").key(key).build();
  }

  @Test
  void deletesPlayCountsThenRowsThenTheArchivesOfScoresWithFiles() {
    UUID mbid = UUID.randomUUID();
    var withMbid = stored(mbid, true);
    var withoutMbid = stored(null, true);
    var noFiles = stored(null, false);
    when(scoreRepository.findStoredFilesByOwnerId(owner.getId())).thenReturn(List.of(withMbid, withoutMbid, noFiles));
    when(scoreRepository.deleteAllByOwnerId(owner.getId())).thenReturn(3);

    assertEquals(3, scoreService.deleteAllScoresOf(owner));

    var order = inOrder(userPlayCountRepository, scoreRepository, s3Client);
    order.verify(userPlayCountRepository).deleteByScoreId(withMbid.getId());
    order.verify(scoreRepository).deleteAllByOwnerId(owner.getId());
    order.verify(s3Client).deleteObject(s3Delete("scores/" + owner.getId() + "/" + mbid + "/2.zip"));
    verify(userPlayCountRepository).deleteByScoreId(noFiles.getId());
    verify(s3Client).deleteObject(s3Delete("scores/" + owner.getId() + "/" + withoutMbid.getId() + "/2.zip"));
    verify(s3Client, times(2)).deleteObject(any(DeleteObjectRequest.class));
    verify(scoreRepository, never()).findById(any());
  }

  @Test
  void keepsGoingWhenAnArchiveCannotBeDeleted() {
    var first = stored(null, true);
    var second = stored(null, true);
    when(scoreRepository.findStoredFilesByOwnerId(owner.getId())).thenReturn(List.of(first, second));
    when(scoreRepository.deleteAllByOwnerId(owner.getId())).thenReturn(2);
    when(s3Client.deleteObject(any(DeleteObjectRequest.class)))
      .thenThrow(S3Exception.builder().statusCode(500).message("down").build());

    assertEquals(2, scoreService.deleteAllScoresOf(owner));
    verify(s3Client, times(2)).deleteObject(any(DeleteObjectRequest.class));
  }

  @Test
  void nothingToDeleteForAnAccountWithoutScores() {
    when(scoreRepository.findStoredFilesByOwnerId(owner.getId())).thenReturn(List.of());

    assertEquals(0, scoreService.deleteAllScoresOf(owner));
    verifyNoInteractions(s3Client, userPlayCountRepository);
  }
}
