package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.WorkloadRepository;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** PackService running the conversion scripts for real (ProcessBuilder), against fake *2pack.sh scripts. */
class PackServiceScriptsTest {

  @TempDir
  Path scripts;

  private PackService packService;
  private S3Client s3Client;
  private WorkloadRepository workloadRepository;
  private CloudRunJobService cloudRunJobService;
  private Score score;

  private PackService packService(Path scriptsDir) {
    PackService service = new PackService();
    ReflectionTestUtils.setField(service, "s3Client", s3Client);
    ReflectionTestUtils.setField(service, "workloadRepository", workloadRepository);
    ReflectionTestUtils.setField(service, "cloudRunJobService", cloudRunJobService);
    ReflectionTestUtils.setField(service, "bucketName", "test-bucket");
    ReflectionTestUtils.setField(service, "scriptsDir", scriptsDir.toString());
    return service;
  }

  @BeforeEach
  void setUp() throws IOException {
    s3Client = mock(S3Client.class);
    workloadRepository = mock(WorkloadRepository.class);
    cloudRunJobService = mock(CloudRunJobService.class);
    packService = packService(FakePackScripts.install(scripts));
    Author satie = new Author();
    satie.setName("Erik Satie");
    score = new Score();
    score.setId(UUID.randomUUID());
    score.setTitle("Gymnopédie No. 1");
    score.setAuthor(satie);
    score.setStudyTracks("0,1");
  }

  private PackScriptDto upload(String type, String content, Boolean makeFingerings) {
    return new PackScriptDto(new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)), score, type, makeFingerings);
  }

  private static Map<String, String> entries(Path zip) throws IOException {
    return entries(Files.readAllBytes(zip));
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

  /** Files the fake script left next to the zip: its arguments and a copy of its input. */
  private static List<String> args(Path zip) throws IOException {
    return Files.readAllLines(Path.of(zip.toString().replaceAll("\\.zip$", ".args")));
  }

  private static String input(Path zip) throws IOException {
    return Files.readString(Path.of(zip.toString().replaceAll("\\.zip$", ".input")));
  }

  @Nested
  class RunningTheScripts {
    @Test
    void midiRunsMidi2pack_withTheScoreDetailsAsArguments() throws IOException {
      Path zip = Path.of(packService.packMidi(upload("midi", "MThd...", false)));

      List<String> args = args(zip);
      assertThat(args.get(0)).endsWith(".midi").contains("upload_" + score.getId()); // the uploaded file
      assertThat(args.subList(1, 6)).containsExactly("Gymnopédie No. 1", "Erik Satie", "false", "0", "1");
      assertThat(input(zip)).isEqualTo("MThd...");
      assertThat(entries(zip).get("score.musicxml")).contains("midi2pack.sh");
    }

    @Test
    void addsTheUntouchedUploadToTheResultAs_ori() throws IOException {
      Path zip = Path.of(packService.packMidi(upload("midi", "original bytes", null)));
      assertThat(entries(zip)).containsEntry("ori.midi", "original bytes").containsKeys("score.musicxml", "metadata.json");
      assertThat(args(zip).get(3)).isEqualTo("true"); // fingering defaults to on
    }

    @Test
    void writesTheZipNextToTheInput_withoutTheUploadPrefixAndExtension() throws IOException {
      Path zip = Path.of(packService.packPdf(upload("pdf", "%PDF", true)));
      Path input = Path.of(args(zip).get(0));
      assertThat(zip.getParent()).isEqualTo(input.getParent());
      assertThat(zip.getFileName().toString()).doesNotContain("upload_").endsWith(".zip");
      assertThat(input.getFileName().toString().replaceFirst("upload_", "").replace(".pdf", ".zip")).isEqualTo(zip.getFileName().toString());
    }

    @Test
    void deletesTheUploadedTempFile() throws IOException {
      Path zip = Path.of(packService.packMidi(upload("midi", "MThd", true)));
      assertThat(Path.of(args(zip).get(0))).doesNotExist();
    }

    @Test
    void musicXmlAndMxlUseMusicxml2pack_keepingTheirExtension() throws IOException {
      Path xml = Path.of(packService.packMusicXml(upload("musicxml", "<score/>", true)));
      assertThat(args(xml).get(0)).endsWith(".musicxml");
      assertThat(entries(xml)).containsEntry("ori.musicxml", "<score/>");
      Path mxl = Path.of(packService.packMusicXml(upload("mxl", "PK-compressed", true)));
      assertThat(entries(mxl)).containsEntry("ori.mxl", "PK-compressed");
      assertThat(entries(mxl).get("score.musicxml")).contains("musicxml2pack.sh");
    }

    @Test
    void pdfAndImagesRunTheirOwnScripts() throws IOException {
      assertThat(entries(Path.of(packService.packPdf(upload("pdf", "%PDF", true))))).containsEntry("ori.pdf", "%PDF")
        .hasEntrySatisfying("score.musicxml", xml -> assertThat(xml).contains("pdf2pack.sh"));
      assertThat(entries(Path.of(packService.packImage(upload("image", "PNG", true))))).containsEntry("ori.png", "PNG")
        .hasEntrySatisfying("score.musicxml", xml -> assertThat(xml).contains("image2pack.sh"));
    }

    @Test
    void packArchiveDispatchesRecognitionWorkloadsByKind() throws IOException {
      assertThat(entries(Path.of(packService.packArchive(upload("pdf", "%PDF", true), Workload.KIND_OMR_PDF)))).containsKey("ori.pdf");
      assertThat(entries(Path.of(packService.packArchive(upload("image", "PNG", true), Workload.KIND_OMR_IMAGE)))).containsKey("ori.png");
      assertThatThrownBy(() -> packService.packArchive(upload("midi", "x", true), "KIND_UNKNOWN"))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("KIND_UNKNOWN");
    }

    @Test
    void aFailingScriptFails_andCleansUp() throws IOException {
      Path failingDir = Files.createDirectory(scripts.resolve("failing"));
      PackService failing = packService(FakePackScripts.install(failingDir, "midi2pack.sh"));

      assertThatThrownBy(() -> failing.packMidi(upload("midi", "MThd", true)))
        .isInstanceOf(RuntimeException.class).hasMessageContaining("midi2pack.sh");
      try (var leftovers = Files.list(Path.of(System.getProperty("java.io.tmpdir")))) {
        assertThat(leftovers.map(p -> p.getFileName().toString()))
          .noneMatch(name -> name.startsWith("upload_" + score.getId()) || name.startsWith("original_" + score.getId()));
      }
    }

    @Test
    void aMissingScriptFails() {
      PackService noScripts = packService(scripts.resolve("does-not-exist"));
      assertThatThrownBy(() -> noScripts.packMidi(upload("midi", "MThd", true)))
        .isInstanceOf(RuntimeException.class).hasMessage("Error during packing");
    }

    @Test
    void anUnsupportedTypeHasNoExtension() {
      assertThatThrownBy(() -> upload("wav", "x", true).getExtension()).isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void theResultZipPathOnlyLooksAtTheFileName() {
    assertThat(PackService.resultZipPath(Path.of("/tmp/v1.2/upload_abc123.pdf"))).isEqualTo(Path.of("/tmp/v1.2/abc123.zip"));
    assertThat(PackService.resultZipPath(Path.of("/home/first.last/tmp/upload_x.y.midi"))).isEqualTo(Path.of("/home/first.last/tmp/x.y.zip"));
    assertThat(PackService.resultZipPath(Path.of("/tmp/noext"))).isEqualTo(Path.of("/tmp/noext.zip"));
  }

  @Nested
  class RecognitionWorkloads {
    private final String key = "scores/owner/score/1.zip";

    @BeforeEach
    void savesReturnTheWorkload() {
      when(workloadRepository.save(any(Workload.class))).thenAnswer(call -> call.getArgument(0));
    }

    private Workload lastSaved(int saves) {
      ArgumentCaptor<Workload> saved = ArgumentCaptor.forClass(Workload.class);
      verify(workloadRepository, times(saves)).save(saved.capture());
      return saved.getValue();
    }

    @Test
    void aPdfIsStoredAs_oriPdf_queuedAsAWorkload_andTheRecognitionJobStarted() throws IOException {
      when(cloudRunJobService.executeJob(score.getId().toString(), key)).thenReturn(CompletableFuture.completedFuture("executions/1"));

      packService.packPDFWorkload(upload("pdf", "%PDF-1.7", false), key);

      ArgumentCaptor<RequestBody> body = ArgumentCaptor.forClass(RequestBody.class);
      verify(s3Client).putObject(org.mockito.ArgumentMatchers.eq(PutObjectRequest.builder().bucket("test-bucket").key(key).build()), body.capture());
      byte[] stored = body.getValue().contentStreamProvider().newStream().readAllBytes();
      assertThat(entries(stored)).isEqualTo(Map.of("ori.pdf", "%PDF-1.7"));

      Workload workload = lastSaved(2); // created, then saved again once the job started
      assertThat(workload.getKind()).isEqualTo(Workload.KIND_OMR_PDF);
      assertThat(workload.getScoreId()).isEqualTo(score.getId());
      assertThat(workload.getStatus()).isEqualTo(Workload.WorkloadStatus.PENDING);
      assertThat(workload.getWorkloadSize()).isEqualTo(stored.length);
      assertThat(workload.getMakeFingerings()).isFalse();
      assertThat(workload.getCreatedAt()).isNotNull();
    }

    @Test
    void anImageIsStoredAs_oriPng() throws IOException {
      when(cloudRunJobService.executeJob(any(), any())).thenReturn(CompletableFuture.completedFuture("executions/2"));
      packService.packImageWorkload(upload("image", "PNG", true), key);
      ArgumentCaptor<RequestBody> body = ArgumentCaptor.forClass(RequestBody.class);
      verify(s3Client).putObject(any(PutObjectRequest.class), body.capture());
      assertThat(entries(body.getValue().contentStreamProvider().newStream().readAllBytes())).containsOnlyKeys("ori.png");
      assertThat(lastSaved(2).getKind()).isEqualTo(Workload.KIND_OMR_IMAGE);
    }

    @Test
    void marksTheWorkloadFailedWhenTheJobCouldNotStart() throws IOException {
      // CloudRunJobService completes with null when the job could not be started
      when(cloudRunJobService.executeJob(any(), any())).thenReturn(CompletableFuture.completedFuture(null));
      packService.packPDFWorkload(upload("pdf", "%PDF", true), key);
      assertThat(lastSaved(2).getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    }

    @Test
    void marksTheWorkloadFailedWhenTheJobFails() throws IOException {
      when(cloudRunJobService.executeJob(any(), any())).thenReturn(CompletableFuture.failedFuture(new IllegalStateException("quota")));
      packService.packPDFWorkload(upload("pdf", "%PDF", true), key);
      assertThat(lastSaved(2).getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    }

    @Test
    void marksTheWorkloadFailedAndFailsWhenTheJobCannotBeRequested() {
      when(cloudRunJobService.executeJob(any(), any())).thenThrow(new IllegalStateException("no credentials"));
      assertThatThrownBy(() -> packService.packPDFWorkload(upload("pdf", "%PDF", true), key))
        .isInstanceOf(RuntimeException.class).hasMessage("Failed to trigger Cloud Run job");
      assertThat(lastSaved(2).getStatus()).isEqualTo(Workload.WorkloadStatus.FAILED);
    }
  }
}
