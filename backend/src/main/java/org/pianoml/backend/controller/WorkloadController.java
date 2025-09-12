package org.pianoml.backend.controller;

import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.model.WorkloadApiInfo;
import org.pianoml.backend.mapper.WorkloadMapper;
import org.pianoml.backend.service.WorkloadService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WorkloadController implements org.pianoml.backend.api.WorkloadApi {

    private final WorkloadService workloadService;
    private final WorkloadMapper workloadMapper;

    @Autowired
    public WorkloadController(WorkloadService workloadService, WorkloadMapper workloadMapper) {
        this.workloadService = workloadService;
        this.workloadMapper = workloadMapper;
    }

    @Override
    public ResponseEntity<WorkloadApiInfo> workloadIdGet(Integer id) {
        Workload workload = workloadService.getWorkloadById(id);
        WorkloadApiInfo workloadApiInfo = workloadMapper.toApiInfo(workload);
        return ResponseEntity.ok(workloadApiInfo);
    }
}
