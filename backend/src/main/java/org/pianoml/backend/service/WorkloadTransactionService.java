package org.pianoml.backend.service;

import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.WorkloadRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class WorkloadTransactionService {

    @Autowired
    private WorkloadRepository workloadRepository;

    /**
     * Process a single workload within a transaction
     */
    @Transactional
    public void processWorkloadWithTransaction(Workload workload, Runnable workloadLogic) {
        log.info("Processing workload ID: {}, Kind: {}", workload.getId(), workload.getKind());

        long startTime = System.currentTimeMillis();

        // Update status to PROCESSING
        //workload.setStatus(Workload.WorkloadStatus.PROCESSING);
        workloadRepository.save(workload);

        try {
            // Execute the actual processing logic
            workloadLogic.run();

            // Mark as completed on success
            long duration = System.currentTimeMillis() - startTime;
            workload.setStatus(Workload.WorkloadStatus.COMPLETED);
            //workload.setDuration((int) duration);
            workload.setErrorMessage(null);
            workloadRepository.save(workload);

            log.info("Successfully processed workload ID: {} in {}ms", workload.getId(), duration);

        } catch (Exception e) {
            // Mark as failed on error
            long duration = System.currentTimeMillis() - startTime;
            //workload.setStatus(Workload.WorkloadStatus.FAILED);
            workload.setDuration((int) duration);
            workload.setErrorMessage(e.getMessage());
            workloadRepository.save(workload);

            log.error("Failed to process workload ID: {} - Error: {}", workload.getId(), e.getMessage(), e);
            throw e; // Re-throw to maintain error propagation
        }
    }
}
