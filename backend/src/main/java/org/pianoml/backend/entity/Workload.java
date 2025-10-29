package org.pianoml.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "workload", schema = "pianoml")
public class Workload {

  public static final String KIND_OMR_PDF = "KIND_OMR_PDF";

  public static final String KIND_OMR_IMAGE = "KIND_OMR_IMAGE";

  // Getters and Setters
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "workload_id_seq")
  @SequenceGenerator(name = "workload_id_seq", sequenceName = "pianoml.workload_id_seq", allocationSize = 1)
  private Integer id;

  @Column(name = "kind", nullable = false)
  private String kind;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @Column(name = "scoreid")
  private UUID scoreId;

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false)
  private WorkloadStatus status = WorkloadStatus.PENDING;

  @Column(name = "error_message", length = 1000)
  private String errorMessage;

  @Column(name = "duration")
  private Integer duration;

  @Column(name = "workload_size")
  private Integer workloadSize;

  public enum WorkloadStatus {
    PENDING, RUNNING, COMPLETED, FAILED
  }


}
