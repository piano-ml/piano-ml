package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.WorkloadRepository;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The Cloud Run job's side of a PDF / image import: for each pending workload, fetch the original from S3, run
 * the recognition (PackService), store the result, update the score and the workload.
 */
class WorkloadProcessingServiceTest {

  @TempDir
  Path tmp;

  private WorkloadRepository workloadRepository;
  private ScoreRepository scoreRepository;
  private PackService packService;
  private ScoreService scoreService;
  private S3Client s3Client;
  private WorkloadProcessingService processing;
  private Score score;

  @BeforeEach
  void setUp() {
    workloadRepository = mock(WorkloadRepository.class);
    scoreRepository = mock(ScoreRepository.class);
    packService = mock(PackService.class);
    scoreService = mock(ScoreService.class);
    s3Client = mock(S3Client.class);
    processing = new WorkloadProcessingService(workloadRepository, scoreRepository, packService, scoreService, s3Client);
    ReflectionTestUtils.setField(processing, "bucketName", "test-bucket");

    User owner = new User();
    owner.setId(UUID.randomUUID());
    Author author = new Author();
    author.setName("Erik Satie");
    score = new Score();
    score.setId(UUID.randomUUID());
    score.setTitle("Gnossienne No. 1");
    score.setAuthor(author);
    score.setOwner(owner);
    score.setVersion(1);
    score.setStudyTracks("0,1");
    score.setHasFiles(false);
    when(scoreRepository.findById(score.getId())).thenReturn(Optional.of(score));
  }

  private String key() {
    return "scores/" + score.getOwner().getId() + "/" + score.getId() + "/1.zip";
  }

  private Workload workload(String kind) {
    Workload workload = new Workload();
    workload.setId(1);
    workload.setKind(kind);
    workload.setScoreId(score.getId());
    workload.setCreatedAt(LocalDateTime.now());
    workload.setMakeFingerings(false);
    return workload;
  }

  private void s3Holds(Map<String, String> entries) throws IOException {
    byte[] zip = FakePackScripts.zip(entries);
    when(s3Client.getObject(GetObjectRequest.builder().bucket("test-bucket").key(key()).build()))
      .thenAnswer(call -> new ResponseInputStream<>(GetObjectResponse.builder().build(), AbortableInputStream.create(new ByteArrayInputStream(zip))));
  }

  private Path recognitionResult() throws IOException {
    Path result = tmp.resolve("result.zip");
    Files.write(result, FakePackScripts.zip(Map.of("score.musicxml", "<score/>")));
    when(packService.packArchive(any(PackScriptDto.class), any())).thenReturn(result.toString());
    return result;
  }

  @Test
  void doesNothingWithoutPendingWorkloads() throws IOException {
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of());
    assertThat(processing.processPendingWorkloads()).isZero();
    verify(packService, never()).packArchive(any(), any());
  }

  @Test
  void recognizesAPdf_storesTheResult_andCompletesTheWorkload() throws IOException {
    Workload workload = workload(Workload.KIND_OMR_PDF);
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of(workload));
    s3Holds(Map.of("ori.pdf", "%PDF-original"));
    recognitionResult();

    assertThat(processing.processPendingWorkloads()).isEqualTo(1);

    ArgumentCaptor<PackScriptDto> dto = ArgumentCaptor.forClass(PackScriptDto.class);
    verify(packService).packArchive(dto.capture(), eq(Workload.KIND_OMR_PDF));
    assertThat(new String(dto.getValue().getInputStream().readAllBytes(), StandardCharsets.UTF_8)).isEqualTo("%PDF-original");
    assertThat(List.of(dto.getValue().getTitle(), dto.getValue().getComposer(), dto.getValue().getTrackRight(), dto.getValue().getTrackLeft()))
      .containsExactly("Gnossienne No. 1", "Erik Satie", "0", "1");
    assertThat(dto.getValue().getMakeFingerings()).isFalse(); // the user's choice, kept in the workload

    verify(s3Client).putObject(eq(PutObjectRequest.builder().bucket("test-bucket").key(key()).build()), any(RequestBody.class));
    InOrder order = inOrder(workloadRepository, scoreRepository, scoreService);
    order.verify(workloadRepository).saveAndFlush(workload); // RUNNING first
    order.verify(scoreRepository).save(score);
    order.verify(scoreService).infosFromMetadata(score);
    order.verify(workloadRepository).save(workload);
    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.COMPLETED);
    assertThat(score.getHasFiles()).isTrue();
    assertThat(score.getUploadedAt()).isNotNull();
  }

  @Test
  void recognizesAnImageFrom_oriPng() throws IOException {
    Workload workload = workload(Workload.KIND_OMR_IMAGE);
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of(workload));
    s3Holds(Map.of("ori.png", "PNG"));
    recognitionResult();

    processing.processPendingWorkloads();

    verify(packService).packArchive(any(PackScriptDto.class), eq(Workload.KIND_OMR_IMAGE));
    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.COMPLETED);
  }

  @Test
  void failsAWorkloadWhoseScoreIsGone() throws IOException {
    Workload workload = workload(Workload.KIND_OMR_PDF);
    workload.setScoreId(UUID.randomUUID());
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of(workload));

    processing.processPendingWorkloads();

    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    assertThat(workload.getErrorMessage()).startsWith("Score not found for ID");
  }

  @Test
  void failsAnUnknownKind() throws IOException {
    Workload workload = workload("KIND_SOMETHING");
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of(workload));
    processing.processPendingWorkloads();
    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    assertThat(workload.getErrorMessage()).isEqualTo("Unsupported workload kind: KIND_SOMETHING");
  }

  @Test
  void failsWhenTheArchiveHasNoOriginal_namingTheExpectedFile() throws IOException {
    Workload workload = workload(Workload.KIND_OMR_IMAGE);
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of(workload));
    s3Holds(Map.of("ori.pdf", "%PDF")); // a PDF, but an image was expected

    processing.processPendingWorkloads();

    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    assertThat(workload.getErrorMessage()).contains("'ori.png' not found");
    verify(packService, never()).packArchive(any(), any());
  }

  @Test
  void failsWhenRecognitionFails_withoutTouchingTheScore() throws IOException {
    Workload workload = workload(Workload.KIND_OMR_PDF);
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of(workload));
    s3Holds(Map.of("ori.pdf", "%PDF"));
    when(packService.packArchive(any(), any())).thenThrow(new RuntimeException("Error during packing with scripts/pdf2pack.sh"));

    processing.processPendingWorkloads();

    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    assertThat(workload.getErrorMessage()).contains("pdf2pack.sh");
    verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    verify(scoreRepository, never()).save(any());
  }

  @Test
  void oneFailureDoesNotStopTheOthers_processedOldestFirst() throws IOException {
    Workload broken = workload("KIND_SOMETHING");
    Workload fine = workload(Workload.KIND_OMR_PDF);
    fine.setId(2);
    when(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).thenReturn(List.of(broken, fine));
    s3Holds(Map.of("ori.pdf", "%PDF"));
    recognitionResult();

    assertThat(processing.processPendingWorkloads()).isEqualTo(2);
    assertThat(broken.getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    assertThat(fine.getStatus()).isEqualTo(Workload.WorkloadStatus.COMPLETED);
  }
}
