package org.pianoml.backend;

import org.pianoml.backend.service.WorkloadProcessingService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication
public class PianoMLApplication {

	public static void main(String[] args) {
		// Check for --process-workload argument
		boolean processWorkload = false;
		for (String arg : args) {
			if ("--process-workload".equals(arg)) {
				processWorkload = true;
				break;
			}
		}

		if (processWorkload) {
			ConfigurableApplicationContext context = SpringApplication.run(PianoMLApplication.class, args);
			WorkloadProcessingService workloadService = context.getBean(WorkloadProcessingService.class);
			workloadService.processAllWorkloads();
		} else {
			SpringApplication.run(PianoMLApplication.class, args);
		}
	}

}
