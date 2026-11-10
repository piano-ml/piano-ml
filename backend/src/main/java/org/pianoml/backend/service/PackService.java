package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.WorkloadRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.*;
import java.net.URI;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.time.OffsetDateTime;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import static org.pianoml.backend.entity.Workload.KIND_OMR_IMAGE;
import static org.pianoml.backend.entity.Workload.KIND_OMR_PDF;

@Service
@Slf4j
public class PackService {

  public static final String ORIGINAL_PDF_FILENAME = "ori.pdf";

  public static final String ORIGINAL_IMAGE_FILENAME = "ori.png";

  public static final String ORIGINAL_FILENAME_PREFIX = "ori";

  @Autowired
  private S3Client s3Client;

  @Autowired
  private WorkloadRepository workloadRepository;

  @Autowired
  private CloudRunJobService cloudRunJobService;

  @Value("${aws.s3.bucket-name:'no-bucket'}")
  private String bucketName;

  public String packArchive(PackScriptDto packScriptDto, String kind) throws IOException {
    if (kind.equals(KIND_OMR_PDF)) {
      return packPdf(packScriptDto);
    } else if (kind.equals(KIND_OMR_IMAGE)) {
      return packImage(packScriptDto);
    } else {
      throw new IllegalArgumentException("Unsupported kind for packing: " + kind);
    }
  }

  public String packImage(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".png").toFile();
    // Copy inputStream to tempFile
    try (FileOutputStream out = new FileOutputStream(tempFile)) {
      packScriptDto.getInputStream().transferTo(out);
    }
    return runPackScript("scripts/image2pack.sh", tempFile, packScriptDto, ".png");
  }

  public String packPdf(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".pdf").toFile();
    // Copy inputStream to tempFile
    try (FileOutputStream out = new FileOutputStream(tempFile)) {
      packScriptDto.getInputStream().transferTo(out);
    }
    return runPackScript("scripts/pdf2pack.sh", tempFile, packScriptDto, ".pdf");
  }


  public String packMidi(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".midi").toFile();
    try (FileOutputStream out = new FileOutputStream(tempFile)) {
      packScriptDto.getInputStream().transferTo(out);
    }
    return runPackScript("scripts/midi2pack.sh", tempFile, packScriptDto, ".midi");
  }

  private boolean isZipFile(File file) {
    try (ZipInputStream zis = new ZipInputStream(new FileInputStream(file))) {
      return zis.getNextEntry() != null;
    } catch (IOException e) {
      return false;
    }
  }

  public String packMusicXml(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), packScriptDto.getExtension()).toFile();
    try (FileOutputStream out = new FileOutputStream(tempFile)) {
      packScriptDto.getInputStream().transferTo(out);
    }
    return runPackScript("scripts/musicxml2pack.sh", tempFile, packScriptDto, packScriptDto.getExtension());
  }

  private void uploadOriginalFileToS3(String s3Key, byte[] zipData) {
    // 2. Upload to S3
    s3Client.putObject(
      PutObjectRequest.builder()
        .bucket(bucketName)
        .key(s3Key)
        .build(),
      RequestBody.fromBytes(zipData)
    );
    log.info("Successfully uploaded workload zip to S3: {}", s3Key);
  }

  public void packImageWorkload(PackScriptDto packScriptDto, String s3Key) throws IOException {
    // 1. Create zip file with PDF as "ori.pdf"
    byte[] zipData = createZipWithOriginalFile(packScriptDto.getInputStream(), ORIGINAL_IMAGE_FILENAME);
    uploadOriginalFileToS3(s3Key, zipData);


    Workload workload = createWorkload(KIND_OMR_IMAGE, packScriptDto, zipData.length);
    log.info("Created workload entry for PDF processing: scoreId={}", packScriptDto.getId());

    // 4. Trigger Cloud Run job execution
    triggerCloudRunJob(packScriptDto, workload, s3Key);
  }

  public void packPDFWorkload(PackScriptDto packScriptDto, String s3Key) throws IOException {
    // 1. Create zip file with PDF as "ori.pdf"
    byte[] zipData = createZipWithOriginalFile(packScriptDto.getInputStream(), ORIGINAL_PDF_FILENAME);
    uploadOriginalFileToS3(s3Key, zipData);


    Workload workload = createWorkload(KIND_OMR_PDF, packScriptDto, zipData.length);
    log.info("Created workload entry for PDF processing: scoreId={}", packScriptDto.getId());

    // 4. Trigger Cloud Run job execution
    triggerCloudRunJob(packScriptDto, workload, s3Key);

  }

  private Workload createWorkload(String kind, PackScriptDto packScriptDto, int length) {
    // 3. Create workload entry
    Workload workload = new Workload();
    workload.setKind(kind);
    workload.setScoreId(java.util.UUID.fromString(packScriptDto.getId()));
    workload.setCreatedAt(OffsetDateTime.now().toLocalDateTime());
    workload.setStatus(Workload.WorkloadStatus.PENDING);
    workload.setWorkloadSize(length);
    workload.setMakeFingerings(packScriptDto.getMakeFingerings());
    workloadRepository.save(workload);
    return workload;
  }


  private void triggerCloudRunJob(PackScriptDto packScriptDto, Workload workload, String s3Key) {
    try {
      cloudRunJobService.executeJob(packScriptDto.getId(), s3Key)
        .whenComplete((executionName, throwable) -> {
          if (throwable != null) {
            workload.setStatus(Workload.WorkloadStatus.FAILED);
            log.error("Failed to execute Cloud Run job for scoreId: {}", packScriptDto.getId(), throwable);
            workloadRepository.save(workload);
          } else {
            log.info("Cloud Run job execution started successfully for scoreId: {}, execution: {}",
              packScriptDto.getId(), executionName);
            workloadRepository.save(workload);
          }
        });
    } catch (Exception e) {
      log.error("Exception while triggering Cloud Run job for scoreId: {}", packScriptDto.getId(), e);
      // Update workload status to FAILED
      workload.setStatus(Workload.WorkloadStatus.FAILED);
      workloadRepository.save(workload);
      throw new RuntimeException("Failed to trigger Cloud Run job", e);
    }
  }

  private byte[] createZipWithOriginalFile(InputStream pdfInputStream, String originalFilename) throws IOException {
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    try (ZipOutputStream zos = new ZipOutputStream(baos)) {
      // Add PDF file as "ori.pdf"
      ZipEntry pdfEntry = new ZipEntry(originalFilename);
      zos.putNextEntry(pdfEntry);

      // Copy PDF content to zip
      byte[] buffer = new byte[8192];
      int bytesRead;
      while ((bytesRead = pdfInputStream.read(buffer)) != -1) {
        zos.write(buffer, 0, bytesRead);
      }

      zos.closeEntry();
    }
    return baos.toByteArray();
  }

  /**
   * Command line for the *2pack.sh scripts:
   * {@code <script> <INPUT_FILE> <TITLE> <COMPOSER> <MAKE_FINGERING> <TRACK_RIGHT> <TRACK_LEFT>}.
   * MAKE_FINGERING is "true"/"false" (the scripts accept 1|true|yes|y, case-insensitive).
   */
  static java.util.List<String> buildScriptCommand(String script, File inputFile, PackScriptDto packScriptDto) {
    return java.util.Arrays.asList(
      script,
      inputFile.getAbsolutePath(),
      packScriptDto.getTitle(),
      packScriptDto.getComposer(),
      String.valueOf(packScriptDto.getMakeFingerings()),
      packScriptDto.getTrackRight(),
      packScriptDto.getTrackLeft());
  }

  /**
   * Runs a pack script on {@code tempFile} and adds the untouched upload to the resulting zip as
   * {@code ori<extension>}. The scripts rename or delete their input, so a copy is taken first.
   */
  private String runPackScript(String script, File tempFile, PackScriptDto packScriptDto, String extension) throws IOException {
    Path originalCopy = Files.createTempFile("original_" + packScriptDto.getId(), extension);
    try {
      Files.copy(tempFile.toPath(), originalCopy, StandardCopyOption.REPLACE_EXISTING);
      // File is already written by calling method, no need to copy inputStream again

      // Appel du script de conversion PDF -> MusicXML
      ProcessBuilder pb = new ProcessBuilder(buildScriptCommand(script, tempFile, packScriptDto));
      pb.redirectErrorStream(true);
      Process process = pb.start();
      try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()))) {
        String line;
        while ((line = reader.readLine()) != null) {
          log.info(line);
        }
      }
      int exitCode = process.waitFor();
      if (exitCode != 0) {
        throw new RuntimeException("Error during packing with " + script);
      }
      String zipPath = tempFile.getAbsolutePath().replace("upload_", "").split("\\.")[0] + ".zip";
      addOriginalToZip(Paths.get(zipPath), originalCopy, ORIGINAL_FILENAME_PREFIX + extension);
      return zipPath;
    } catch (IOException | InterruptedException e) {
      throw new RuntimeException("Error during packing", e);
    } finally {
      Files.deleteIfExists(originalCopy);
      if (tempFile != null && tempFile.exists()) {
        tempFile.delete();
      }
    }
  }

  /** Adds {@code file} to an existing zip archive under {@code entryName}, replacing any entry with that name. */
  static void addOriginalToZip(Path zip, Path file, String entryName) throws IOException {
    URI uri = URI.create("jar:" + zip.toUri());
    try (FileSystem zipFs = FileSystems.newFileSystem(uri, Map.of())) {
      Files.copy(file, zipFs.getPath(entryName), StandardCopyOption.REPLACE_EXISTING);
    }
  }
}
