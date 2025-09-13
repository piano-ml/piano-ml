package org.pianoml.backend.service;

import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.cloud.run.v2.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.config.GoogleCloudProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class CloudRunJobService {

  private final GoogleCloudProperties googleCloudProperties;

  /**
   * Execute a Cloud Run job with the specified arguments and environment variables
   */
  public CompletableFuture<String> executeJob(String scoreId, String s3Key) {
    return CompletableFuture.supplyAsync(() -> {
      try {
        log.info("Starting Cloud Run job execution for scoreId: {}, s3Key: {}", scoreId, s3Key);

        // Build the job name
        JobName jobName = JobName.of(
          googleCloudProperties.getProjectId(),
          googleCloudProperties.getLocation(),
          googleCloudProperties.getRun().getJobName()
        );

        // Use try-with-resources to ensure proper cleanup
        try (JobsClient jobsClient = createJobsClient()) {
          // Create the run job request with overrides
          RunJobRequest.Builder requestBuilder = RunJobRequest.newBuilder()
            .setName(jobName.toString());

          // Execute the job
          Execution executionRef = jobsClient.runJobAsync(requestBuilder.build()).get();
          String executionName = executionRef.getName();

          log.info("Cloud Run job started successfully. Execution: {}", executionName);
          return executionName;
        }

      } catch (Exception e) {
        log.error("Failed to execute Cloud Run job for scoreId: {}", scoreId, e);
        return null;
        //throw new RuntimeException("Failed to execute Cloud Run job", e);
      }
    });
  }


  private JobsClient createJobsClient() throws IOException {
    GoogleCredentials credentials = getCredentials();

    JobsSettings jobsSettings = JobsSettings.newBuilder()
      .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
      .build();

    return JobsClient.create(jobsSettings);
  }

  private GoogleCredentials getCredentials() throws IOException {
    // Try to use service account key if configured
    if (googleCloudProperties.getCredentials().getLocation() != null) {
      try {
        ClassPathResource resource = new ClassPathResource(
          googleCloudProperties.getCredentials().getLocation().replace("classpath:", "")
        );

        if (resource.exists()) {
          try (InputStream serviceAccountStream = resource.getInputStream()) {
            return ServiceAccountCredentials.fromStream(serviceAccountStream);
          }
        }
      } catch (Exception e) {
        log.warn("Failed to load service account credentials from: {}, falling back to default credentials",
          googleCloudProperties.getCredentials().getLocation(), e);
      }
    }

    // Fall back to Application Default Credentials (ADC)
    // This works in Google Cloud environments (Cloud Run, GKE, etc.)
    return GoogleCredentials.getApplicationDefault();
  }
}
