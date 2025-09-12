package org.pianoml.backend.service;

import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.exception.EntityNotFoundException;
import org.pianoml.backend.repository.WorkloadRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class WorkloadService {

    private final WorkloadRepository workloadRepository;

    @Autowired
    public WorkloadService(WorkloadRepository workloadRepository) {
        this.workloadRepository = workloadRepository;
    }

    public Workload getWorkloadById(Integer id) {
        return workloadRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Workload not found with id: " + id));
    }


}
