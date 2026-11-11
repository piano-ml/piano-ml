package org.pianoml.backend.service;

import com.google.api.gax.longrunning.OperationFuture;
import com.google.cloud.run.v2.Execution;
import com.google.cloud.run.v2.JobsClient;
import com.google.cloud.run.v2.RunJobRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.config.GoogleCloudProperties;

import java.io.IOException;
import java.util.concurrent.ExecutionException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Starting the recognition job on Cloud Run, with Google's JobsClient mocked. */
class CloudRunJobServiceTest {

  private CloudRunJobService service;
  private JobsClient jobsClient;

  @BeforeEach
  void setUp() {
    GoogleCloudProperties properties = new GoogleCloudProperties();
    properties.setProjectId("pianoml");
    properties.setLocation("europe-west1");
    properties.getRun().setJobName("omr-job");
    service = spy(new CloudRunJobService(properties));
    jobsClient = mock(JobsClient.class);
  }

  @Test
  @SuppressWarnings("unchecked")
  void startsTheConfiguredJob_andReturnsTheExecutionName() throws Exception {
    doReturn(jobsClient).when(service).createJobsClient();
    OperationFuture<Execution, Execution> operation = mock(OperationFuture.class);
    when(operation.get()).thenReturn(Execution.newBuilder().setName("projects/pianoml/locations/europe-west1/jobs/omr-job/executions/abc").build());
    when(jobsClient.runJobAsync(any(RunJobRequest.class))).thenReturn(operation);

    String execution = service.executeJob("score-1", "scores/o/s/1.zip").get();

    assertThat(execution).endsWith("/executions/abc");
    ArgumentCaptor<RunJobRequest> request = ArgumentCaptor.forClass(RunJobRequest.class);
    verify(jobsClient).runJobAsync(request.capture());
    assertThat(request.getValue().getName()).isEqualTo("projects/pianoml/locations/europe-west1/jobs/omr-job");
    verify(jobsClient).close(); // the client is released
  }

  @Test
  void completesWithNullWhenTheClientCannotBeCreated() throws Exception {
    doThrow(new IOException("no credentials")).when(service).createJobsClient();
    assertThat(service.executeJob("score-1", "key").get()).isNull();
  }

  @Test
  @SuppressWarnings("unchecked")
  void completesWithNullWhenTheJobFails() throws Exception {
    doReturn(jobsClient).when(service).createJobsClient();
    OperationFuture<Execution, Execution> operation = mock(OperationFuture.class);
    when(operation.get()).thenThrow(new ExecutionException(new IllegalStateException("job not found")));
    when(jobsClient.runJobAsync(any(RunJobRequest.class))).thenReturn(operation);

    assertThat(service.executeJob("score-1", "key").get()).isNull();
    verify(jobsClient).close();
  }
}
