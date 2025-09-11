package org.pianoml.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "workload", schema = "pianoml")
@Data
public class Workload {

    public static final String KIND_OMR_PDF = "OMR_PDF";

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "workload_id_seq")
    @SequenceGenerator(name = "workload_id_seq", sequenceName = "workload_id_seq", allocationSize = 1)
    private Integer id;

    @Column(nullable = false)
    private String kind;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "scoreid")
    private UUID scoreId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WorkloadStatus status = WorkloadStatus.PENDING;

    @Column(name = "error_message")
    private String errorMessage;

    @Column
    private Integer duration;

    @Column(name = "workload_size")
    private Integer workloadSize;

    public enum WorkloadStatus {
        PENDING,
        PROCESSING,
        COMPLETED,
        FAILED
    }
}
