package org.pianoml.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Cloud Run jobs start the application with the job profile, without a web context (application-job.properties):
 * no bean may need one, or every job fails at startup (a controller injecting HttpServletRequest did).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("job")
class JobProfileContextTest {

  @Autowired
  private ApplicationContext context;

  @Test
  void theApplicationStarts_withoutAWebContext() {
    assertThat(context.getEnvironment().getActiveProfiles()).contains("job");
  }
}
