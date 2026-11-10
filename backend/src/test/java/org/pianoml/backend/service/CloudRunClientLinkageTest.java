package org.pianoml.backend.service;

import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.retrying.RetrySettings;
import com.google.api.gax.rpc.ApiException;
import com.google.cloud.run.v2.JobName;
import com.google.cloud.run.v2.JobsClient;
import com.google.cloud.run.v2.JobsSettings;
import com.google.cloud.run.v2.RunJobRequest;
import org.junit.jupiter.api.Test;

import java.net.ServerSocket;
import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Guards the google-cloud-run / gax dependency set used by {@link CloudRunJobService}.
 *
 * <p>A version skew between google-cloud-run and gax / gax-grpc / gax-httpjson compiles fine but fails at
 * runtime with NoClassDefFoundError / NoSuchMethodError (see the gax comment in pom.xml). Nothing else in the
 * test suite builds a JobsClient, so this test builds one with the same calls as the service and drives both
 * a unary call and the runJob long-running operation against a closed local port. Any linkage error surfaces
 * as an Error (failing the test); a healthy stack fails with a gRPC ApiException (UNAVAILABLE / DEADLINE).
 */
class CloudRunClientLinkageTest {

  private static int closedPort() throws Exception {
    try (ServerSocket socket = new ServerSocket(0)) {
      return socket.getLocalPort();
    }
  }

  private static JobsClient clientTo(int port) throws Exception {
    RetrySettings fastFail = RetrySettings.newBuilder()
      .setTotalTimeoutDuration(Duration.ofSeconds(2))
      .setInitialRpcTimeoutDuration(Duration.ofSeconds(1))
      .setMaxRpcTimeoutDuration(Duration.ofSeconds(1))
      .setMaxAttempts(1)
      .build();

    JobsSettings.Builder builder = JobsSettings.newBuilder()
      .setCredentialsProvider(NoCredentialsProvider.create())
      .setEndpoint("localhost:" + port);
    builder.getJobSettings().setRetrySettings(fastFail);
    builder.runJobSettings().setRetrySettings(fastFail);
    return JobsClient.create(builder.build());
  }

  @Test
  void unaryCall_failsWithApiException_notLinkageError() throws Exception {
    JobName name = JobName.of("test-project", "europe-west1", "test-job");
    try (JobsClient client = clientTo(closedPort())) {
      ApiException ex = assertThrows(ApiException.class, () -> client.getJob(name));
      assertEquals("UNAVAILABLE_OR_DEADLINE", classify(ex));
    }
  }

  @Test
  void runJobOperation_sameCallsAsService_failsWithApiException_notLinkageError() throws Exception {
    JobName name = JobName.of("test-project", "europe-west1", "test-job");
    RunJobRequest request = RunJobRequest.newBuilder().setName(name.toString()).build();
    try (JobsClient client = clientTo(closedPort())) {
      ExecutionException ex = assertThrows(ExecutionException.class,
        () -> client.runJobAsync(request).get(10, TimeUnit.SECONDS));
      ApiException cause = assertInstanceOf(ApiException.class, ex.getCause());
      assertEquals("UNAVAILABLE_OR_DEADLINE", classify(cause));
    }
  }

  private static String classify(ApiException ex) {
    return switch (ex.getStatusCode().getCode()) {
      case UNAVAILABLE, DEADLINE_EXCEEDED -> "UNAVAILABLE_OR_DEADLINE";
      default -> ex.getStatusCode().getCode().name();
    };
  }
}
