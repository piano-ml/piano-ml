package org.pianoml.backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.WorkloadRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.pianoml.backend.service.ScoreService.makeBucketKeyFromScore;

@Service
@Slf4j
@RequiredArgsConstructor
public class WorkloadProcessingService {

  private final WorkloadRepository workloadRepository;

  private final ScoreRepository scoreRepository;

  private final PackService packService;

  private final ScoreService scoreService;

  //private final WorkloadTransactionService workloadTransactionService;

  private final S3Client s3Client;

  @Value("${aws.s3.bucket-name:'no-bucket'}")
  private String bucketName;

  /**
   * Process all pending workloads in order by created_at
   * Returns when all workloads are processed
   */
  public void processAllWorkloads() {
    log.info("Starting workload processing...");

    List<Workload> pendingWorkloads = workloadRepository.findPendingWorkloadsOrderedByCreatedAt();

    if (pendingWorkloads.isEmpty()) {
      log.info("No pending workloads found. Exiting.");
      System.exit(0);
      return;
    }

    log.info("Found {} pending workloads to process", pendingWorkloads.size());

    for (Workload workload : pendingWorkloads) {
      processOpticalMusicRecognition(workload);
    }

    log.info("All workloads processed. Exiting.");
    System.exit(0);
  }


  /**
   * Implement the actual workload processing logic here
   * This method should contain the business logic for processing different workload types
   */
  private void processOpticalMusicRecognition(Workload workload) {
    log.info("Processing OMR PDF for workload {}", workload.getId());
    workload.setStatus(Workload.WorkloadStatus.RUNNING);
    workloadRepository.saveAndFlush(workload);
    try {
      // 1. Load Score from repository
      Optional<Score> scoreOptional = scoreRepository.findById(workload.getScoreId());
      if (scoreOptional.isEmpty()) {
        workload.setStatus(Workload.WorkloadStatus.FAILED);
        workloadRepository.save(workload);
        throw new RuntimeException("Score not found for ID: " + workload.getScoreId());
      }

      Score score = scoreOptional.get();
      // 2. Generate S3 key using ScoreService method
      String s3Key = makeBucketKeyFromScore(score);
      // 3. Download ZIP from S3 and extract PDF
      String originalFileName;
      if (workload.getKind().equals(Workload.KIND_OMR_PDF)) {
        originalFileName= PackService.ORIGINAL_PDF_FILENAME;
      } else if (workload.getKind().equals(Workload.KIND_OMR_IMAGE)) {
        originalFileName= PackService.ORIGINAL_IMAGE_FILENAME;
      } else {
        throw new IllegalArgumentException("Unsupported workload kind: " + workload.getKind());
      }
      InputStream inputStream = extractOriginalFileFromS3Zip(s3Key, originalFileName);
      // 4. Create PackScriptDto with PDF inputStream and score data
      PackScriptDto packScriptDto = new PackScriptDto(inputStream, score, workload.getKind(), workload.getMakeFingerings());
      // 5. Call packPDF to process the PDF
      String resultPath = packService.packArchive(packScriptDto, workload.getKind());
      log.info("Successfully processed OMR PDF for workload {}, result: {}", workload.getId(), resultPath);
      // upload resultPath to S3
      s3Client.putObject(PutObjectRequest.builder().bucket(bucketName).key(s3Key).build(),
        RequestBody.fromFile(new File(resultPath)));
      log.info("Successfully uploaded processed files to S3: {}", s3Key);
      score.setHasFiles(true);
      score.setUploadedAt(OffsetDateTime.now());
      scoreRepository.save(score);
      scoreService.infosFromMetadata(score);
      workload.setStatus(Workload.WorkloadStatus.COMPLETED);
      workloadRepository.save(workload);
      log.info("Successfully saved workload {} and score {}", workload.getId(), score.getId());
    } catch (Exception e) {
      log.error("Error processing OMR PDF for workload {}: {}", workload.getId(), e.getMessage(), e);
      workload.setErrorMessage(e.getMessage());
      workload.setStatus(Workload.WorkloadStatus.FAILED);
      workloadRepository.save(workload);
    }
  }

  /**
   * Download ZIP from S3 and extract the PDF file (using constant from PackService)
   */
  private InputStream extractOriginalFileFromS3Zip(String s3Key, String originalFileName) throws IOException {
    // Download ZIP from S3
    byte[] zipData = s3Client.getObject(GetObjectRequest.builder()
      .bucket(bucketName)
      .key(s3Key)
      .build()).readAllBytes();

    // Extract PDF from ZIP
    try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipData))) {
      ZipEntry entry;
      while ((entry = zis.getNextEntry()) != null) {
        if (originalFileName.equals(entry.getName())) {
          // Return the PDF content as InputStream
          byte[] pdfContent = zis.readAllBytes();
          return new ByteArrayInputStream(pdfContent);
        }
      }
    }
    throw new RuntimeException("PDF file '" + PackService.ORIGINAL_PDF_FILENAME + "' not found in ZIP");
  }
}
