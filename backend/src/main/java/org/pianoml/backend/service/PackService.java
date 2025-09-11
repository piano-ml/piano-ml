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

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.time.OffsetDateTime;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
@Slf4j
public class PackService {

  public static final String ORIGINAL_PDF_FILENAME = "ori.pdf";

  @Autowired
  private S3Client s3Client;

  @Autowired
  private WorkloadRepository workloadRepository;

  @Autowired
  private CloudRunJobService cloudRunJobService;

  @Value("${aws.s3.bucket-name:'no-bucket'}")
  private String bucketName;

  public String packPDF(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".pdf").toFile();
    // Copy inputStream to tempFile
    try (FileOutputStream out = new FileOutputStream(tempFile)) {
      packScriptDto.getInputStream().transferTo(out);
    }
    return runPackScript("scripts/pdf2pack.sh", tempFile, packScriptDto);
  }

  public String packMidi(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".midi").toFile();
    return runPackScript("scripts/midi2pack.sh", tempFile, packScriptDto);
  }

  public String packMusicXml(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".midi").toFile();
    return runPackScript("scripts/mxml2pack.sh", tempFile, packScriptDto);
  }

  public void packPDFWorkload(PackScriptDto packScriptDto, String s3Key) throws IOException {
    // 1. Create zip file with PDF as "ori.pdf"
    byte[] zipData = createZipWithPDF(packScriptDto.getInputStream());

    // 2. Upload to S3
    s3Client.putObject(
        PutObjectRequest.builder()
            .bucket(bucketName)
            .key(s3Key)
            .build(),
        RequestBody.fromBytes(zipData)
    );
    log.info("Successfully uploaded PDF workload zip to S3: {}", s3Key);

    // 3. Create workload entry
    Workload workload = new Workload();
    workload.setKind(Workload.KIND_OMR_PDF);
    workload.setScoreId(java.util.UUID.fromString(packScriptDto.getId()));
    workload.setCreatedAt(OffsetDateTime.now());
    workload.setStatus(Workload.WorkloadStatus.PENDING);
    workload.setWorkloadSize((int) zipData.length);

    workloadRepository.save(workload);
    log.info("Created workload entry for PDF processing: scoreId={}", packScriptDto.getId());

    // 4. Trigger Cloud Run job execution
    try {
      cloudRunJobService.executeJob(packScriptDto.getId(), s3Key)
          .whenComplete((executionName, throwable) -> {
            if (throwable != null) {
              log.error("Failed to execute Cloud Run job for scoreId: {}", packScriptDto.getId(), throwable);
              // Optionally update workload status to FAILED
              workload.setStatus(Workload.WorkloadStatus.FAILED);
              workloadRepository.save(workload);
            } else {
              log.info("Cloud Run job execution started successfully for scoreId: {}, execution: {}",
                  packScriptDto.getId(), executionName);
              // Optionally update workload with execution reference
              //workload.setStatus(Workload.WorkloadStatus.PROCESSING);
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

  private byte[] createZipWithPDF(InputStream pdfInputStream) throws IOException {
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    try (ZipOutputStream zos = new ZipOutputStream(baos)) {
      // Add PDF file as "ori.pdf"
      ZipEntry pdfEntry = new ZipEntry(ORIGINAL_PDF_FILENAME);
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
      ProcessBuilder pb = new ProcessBuilder(script, tempFile.getAbsolutePath(), packScriptDto.getTitle(), packScriptDto.getComposer(), packScriptDto.getTrackRight(), packScriptDto.getTrackLeft());
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
