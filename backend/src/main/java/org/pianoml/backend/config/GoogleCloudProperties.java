package org.pianoml.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "gcloud")
public class GoogleCloudProperties {

  private String projectId;
  private String location;
  private Credentials credentials = new Credentials();
  private Run run = new Run();

  @Data
  public static class Credentials {
    private String location;
  }

  @Data
  public static class Run {
    private String jobName;
  }
}
