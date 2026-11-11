package org.pianoml.backend.integration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.WorkloadRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.CloudRunJobService;
import org.pianoml.backend.service.FakePackScripts;
import org.pianoml.backend.service.WorkloadProcessingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestTemplate;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Score imports end to end: upload through the API, ScoreService, the real PackService running the
 * *2pack.sh scripts (fakes honoring their contract, see {@link FakePackScripts}), S3 (an in-memory store),
 * and for PDFs the Cloud Run job's side (WorkloadProcessingService). The database is mocked.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ImportPipelineIntegrationTest {

  private static final Path SCRIPTS;

  static {
    try {
      SCRIPTS = FakePackScripts.install(Files.createTempDirectory("fake-pack-scripts"));
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  @DynamicPropertySource
  static void scripts(DynamicPropertyRegistry registry) {
    registry.add("pack.scripts-dir", SCRIPTS::toString);
  }

  @MockitoBean private UserRepository userRepository;
  @MockitoBean private ScoreRepository scoreRepository;
  @MockitoBean private WorkloadRepository workloadRepository;
  @MockitoBean private S3Client s3Client;
  @MockitoBean private RestTemplate restTemplate;
  @MockitoBean private CloudRunJobService cloudRunJobService;

  @Autowired private MockMvc mockMvc;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private WorkloadProcessingService workloadProcessingService;

  /** The S3 bucket: key -> object bytes. */
  private final Map<String, byte[]> bucket = new HashMap<>();
  private User owner;
  private Score score;

  @BeforeEach
  void setUp() {
    owner = new User();
    owner.setId(UUID.randomUUID());
    owner.setEmail("owner@example.com");
    owner.setName("Owner");
    owner.setPassword("x");
    owner.setRoles("USER");
    given(userRepository.findById(owner.getId())).willReturn(Optional.of(owner));

    Author satie = new Author();
    satie.setId(UUID.randomUUID());
    satie.setName("Erik Satie");
    score = new Score();
    score.setId(UUID.randomUUID());
    score.setTitle("Gymnopédie No. 1");
    score.setAuthor(satie);
    score.setOwner(owner);
    score.setVersion(1);
    score.setStudyTracks("0,1");
    score.setHasFiles(false);
    given(scoreRepository.findScoreByIdAndOwnerAndVersion(score.getId(), owner, 1)).willReturn(Optional.of(score));
    given(scoreRepository.findById(score.getId())).willReturn(Optional.of(score));

    given(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class))).willAnswer(call -> {
      PutObjectRequest request = call.getArgument(0);
      RequestBody body = call.getArgument(1);
      bucket.put(request.key(), body.contentStreamProvider().newStream().readAllBytes());
      return PutObjectResponse.builder().build();
    });
    given(s3Client.getObject(any(GetObjectRequest.class))).willAnswer(call -> {
      byte[] object = bucket.get(((GetObjectRequest) call.getArgument(0)).key());
      if (object == null) throw S3Exception.builder().statusCode(404).message("NoSuchKey").build();
      return new ResponseInputStream<>(GetObjectResponse.builder().build(), AbortableInputStream.create(new ByteArrayInputStream(object)));
    });
  }

  private String key() {
    return "scores/" + owner.getId() + "/" + score.getId() + "/1.zip";
  }

  private org.springframework.test.web.servlet.ResultActions upload(String type, String content, String query) throws Exception {
    return mockMvc.perform(post("/score/" + score.getId() + "/" + type + "/1/0" + query)
      .header("Authorization", "Bearer " + jwtTokenProvider.generateToken(owner))
      .contentType(MediaType.APPLICATION_OCTET_STREAM).content(content.getBytes(StandardCharsets.UTF_8)));
  }

  private static Map<String, String> entries(byte[] zip) throws IOException {
    Map<String, String> entries = new TreeMap<>();
    try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
      ZipEntry entry;
      while ((entry = in.getNextEntry()) != null) {
        entries.put(entry.getName(), new String(in.readAllBytes(), StandardCharsets.UTF_8));
      }
    }
    return entries;
  }

  private void assertScoreFilledFromMetadata() {
    assertThat(score.getHasFiles()).isTrue();
    assertThat(score.getUploadedAt()).isNotNull();
    assertThat(List.of(score.getTracksCount(), score.getDuration(), score.getMeasuresCount(), score.getTempo())).containsExactly(2, 60, 12, 96);
    assertThat(List.of(score.getTonic(), score.getMode(), score.getFullKey())).containsExactly("G", "major", "G major");
    assertThat(score.getGrade()).isEqualTo(1.5f);
    verify(scoreRepository, atLeastOnce()).save(score);
  }

  @Test
  void aMidiUploadIsPackedStoredAndDescribed() throws Exception {
    upload("midi", "MThd-the-upload", "?makeFingering=false").andExpect(status().isOk());

    assertThat(entries(bucket.get(key())))
      .containsEntry("ori.midi", "MThd-the-upload")
      .containsKeys("metadata.json")
      .hasEntrySatisfying("score.musicxml", xml -> assertThat(xml).contains("midi2pack.sh"));
    assertScoreFilledFromMetadata();
  }

  @Test
  void aMusicXmlUploadGoesThroughMusicxml2pack() throws Exception {
    upload("musicxml", "<score-partwise/>", "").andExpect(status().isOk());
    assertThat(entries(bucket.get(key()))).containsEntry("ori.musicxml", "<score-partwise/>")
      .hasEntrySatisfying("score.musicxml", xml -> assertThat(xml).contains("musicxml2pack.sh"));
    assertScoreFilledFromMetadata();
  }

  @Test
  void aPdfIsQueuedThenRecognizedByTheCloudRunJob() throws Exception {
    given(cloudRunJobService.executeJob(score.getId().toString(), key())).willReturn(CompletableFuture.completedFuture("executions/42"));
    given(workloadRepository.save(any(Workload.class))).willAnswer(call -> call.getArgument(0));

    // 1. the upload stores the original and queues a recognition workload
    upload("pdf", "%PDF-scan", "?makeFingering=false").andExpect(status().isOk());
    assertThat(entries(bucket.get(key()))).isEqualTo(Map.of("ori.pdf", "%PDF-scan"));
    ArgumentCaptor<Workload> queued = ArgumentCaptor.forClass(Workload.class);
    verify(workloadRepository, atLeastOnce()).save(queued.capture());
    Workload workload = queued.getValue();
    assertThat(workload.getKind()).isEqualTo(Workload.KIND_OMR_PDF);
    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.PENDING);
    assertThat(workload.getMakeFingerings()).isFalse();
    verify(cloudRunJobService).executeJob(eq(score.getId().toString()), eq(key()));
    assertThat(score.getHasFiles()).isFalse(); // nothing to play yet

    // 2. the Cloud Run job recognizes it
    given(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).willReturn(List.of(workload));
    assertThat(workloadProcessingService.processPendingWorkloads()).isEqualTo(1);

    assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.COMPLETED);
    assertThat(entries(bucket.get(key())))
      .containsEntry("ori.pdf", "%PDF-scan")
      .hasEntrySatisfying("score.musicxml", xml -> assertThat(xml).contains("pdf2pack.sh"));
    assertScoreFilledFromMetadata();
  }

  @Test
  void anImageIsQueuedThenRecognized() throws Exception {
    given(cloudRunJobService.executeJob(any(), any())).willReturn(CompletableFuture.completedFuture("executions/43"));
    given(workloadRepository.save(any(Workload.class))).willAnswer(call -> call.getArgument(0));

    upload("image", "PNG-photo", "").andExpect(status().isOk());
    ArgumentCaptor<Workload> queued = ArgumentCaptor.forClass(Workload.class);
    verify(workloadRepository, atLeastOnce()).save(queued.capture());
    given(workloadRepository.findPendingWorkloadsOrderedByCreatedAt()).willReturn(List.of(queued.getValue()));

    workloadProcessingService.processPendingWorkloads();

    assertThat(queued.getValue().getStatus()).isEqualTo(Workload.WorkloadStatus.COMPLETED);
    assertThat(entries(bucket.get(key()))).containsEntry("ori.png", "PNG-photo")
      .hasEntrySatisfying("score.musicxml", xml -> assertThat(xml).contains("image2pack.sh"));
  }
}
