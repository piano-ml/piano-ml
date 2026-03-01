package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.WorkloadRepository;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayInputStream;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PackServicePdfWorkloadTest {

  @Mock
  private S3Client s3Client;

  @Mock
  private WorkloadRepository workloadRepository;

  @Mock
  private CloudRunJobService cloudRunJobService;

  @InjectMocks
  private PackService packService;

  @Captor
  private ArgumentCaptor<Workload> workloadCaptor;

  @BeforeEach
  void setUp() throws Exception {
    // Ensure @Value bucketName is set via reflection
    java.lang.reflect.Field bucketField = PackService.class.getDeclaredField("bucketName");
    bucketField.setAccessible(true);
    bucketField.set(packService, "test-bucket");

    // Make save return the same entity
    when(workloadRepository.save(any(Workload.class))).thenAnswer(i -> i.getArgument(0));
  }

  @Test
  void packPDFWorkload_createsWorkload_uploadsAndTriggersCloudRun() throws Exception {
    // Arrange
    byte[] pdf = "PDF_CONTENT".getBytes();
    Score score = new Score();
    UUID scoreId = UUID.randomUUID();
    score.setId(scoreId);
    User owner = new User();
    owner.setId(UUID.randomUUID());
    score.setOwner(owner);
    score.setTitle("Title");
    Author author = new Author();
    author.setName("Composer");
    score.setAuthor(author);
    score.setStudyTracks("1,2");

    PackScriptDto dto = new PackScriptDto(new ByteArrayInputStream(pdf), score, "pdf", true);
    String s3Key = "scores/test.zip";

    // cloudRun returns immediate completed future
    when(cloudRunJobService.executeJob(anyString(), anyString())).thenReturn(CompletableFuture.completedFuture("exec-1"));

    // Act
    packService.packPDFWorkload(dto, s3Key);

    // Assert

    // verify upload to s3 called once
    verify(s3Client, times(1)).putObject(any(PutObjectRequest.class), any(RequestBody.class));

    // verify workloadRepository.save was called twice: once in createWorkload and once in whenComplete
    verify(workloadRepository, atLeastOnce()).save(workloadCaptor.capture());

    // get the first saved workload (creation)
    Workload created = workloadCaptor.getAllValues().get(0);
    assertEquals(Workload.KIND_OMR_PDF, created.getKind());
    assertEquals(scoreId, created.getScoreId());
    assertNotNull(created.getCreatedAt());
    assertEquals(Workload.WorkloadStatus.PENDING, created.getStatus());
    assertTrue(created.getWorkloadSize() > 0);

    // verify cloud run job executed with the same score id and s3Key
    verify(cloudRunJobService, times(1)).executeJob(eq(dto.getId()), eq(s3Key));
  }
}

