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
import java.nio.file.Files;
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
    return runPackScript("scripts/image2pack.sh", tempFile, packScriptDto);
  }

  public String packPdf(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".pdf").toFile();
    // Copy inputStream to tempFile
    try (FileOutputStream out = new FileOutputStream(tempFile)) {
      packScriptDto.getInputStream().transferTo(out);
    }
    return runPackScript("scripts/pdf2pack.sh", tempFile, packScriptDto);
  }


  public String packMidi(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".midi").toFile();
    try (FileOutputStream out = new FileOutputStream(tempFile)) {
      packScriptDto.getInputStream().transferTo(out);
    }
    if (packScriptDto.getTrackLeft() == null || packScriptDto.getTrackLeft().equals("")) {
      return runPackScript("scripts/midi2pack.sh", tempFile, packScriptDto);
    } else {
      return runPackScript("scripts/midi2pack.sh", tempFile, packScriptDto);
    }
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
    return runPackScript("scripts/musicxml2pack.sh", tempFile, packScriptDto);
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

  private String runPackScript(String script, File tempFile, PackScriptDto packScriptDto) throws IOException {
    try {
      // File is already written by calling method, no need to copy inputStream again

      // Appel du script de conversion PDF -> MusicXML
      ProcessBuilder pb = new ProcessBuilder(script, tempFile.getAbsolutePath(), packScriptDto.getTitle(), packScriptDto.getComposer(), String.valueOf(packScriptDto.getMakeFingerings()),   packScriptDto.getTrackRight(), packScriptDto.getTrackLeft());
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
      return tempFile.getAbsolutePath().replace("upload_", "").split("\\.")[0] + ".zip";
    } catch (IOException | InterruptedException e) {
      throw new RuntimeException("Error during packing", e);
    } finally {
      if (tempFile != null && tempFile.exists()) {
        tempFile.delete();
      }
    }
  }


}
