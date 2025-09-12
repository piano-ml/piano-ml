package org.pianoml.backend.mapper;

import org.pianoml.backend.entity.Workload;

import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.UUID;

@Component
public class WorkloadMapper {

    public org.pianoml.backend.model.WorkloadApiInfo toApiInfo(Workload workload) {
        if (workload == null) {
            return null;
        }

        org.pianoml.backend.model.WorkloadApiInfo apiInfo = new org.pianoml.backend.model.WorkloadApiInfo();
        apiInfo.setId(workload.getId());
        apiInfo.setKind(workload.getKind());
        apiInfo.setCreatedAt(OffsetDateTime.from(workload.getCreatedAt()));
        apiInfo.setScoreId(workload.getScoreId() != null ? UUID.fromString(workload.getScoreId().toString()) : null);
        apiInfo.setStatus(org.pianoml.backend.model.WorkloadApiInfo.StatusEnum.fromValue(workload.getStatus().name()));
        apiInfo.setErrorMessage(workload.getErrorMessage());
        apiInfo.setDuration(workload.getDuration());
        apiInfo.setWorkloadSize(workload.getWorkloadSize());

        return apiInfo;
    }

    public Workload toEntity(org.pianoml.backend.model.WorkloadApiInfo apiInfo) {
        if (apiInfo == null) {
            return null;
        }

        Workload workload = new Workload();
        workload.setId(apiInfo.getId());
        workload.setKind(apiInfo.getKind());
        workload.setCreatedAt(apiInfo.getCreatedAt().toLocalDateTime());

        if (apiInfo.getScoreId() != null) {
            workload.setScoreId(java.util.UUID.fromString(apiInfo.getScoreId().toString()));
        }

        if (apiInfo.getStatus() != null) {
            workload.setStatus(Workload.WorkloadStatus.valueOf(apiInfo.getStatus().getValue()));
        }

        workload.setErrorMessage(apiInfo.getErrorMessage());
        workload.setDuration(apiInfo.getDuration());
        workload.setWorkloadSize(apiInfo.getWorkloadSize());

        return workload;
    }
}
