package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Workload;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WorkloadRepository extends JpaRepository<Workload, Integer> {

    @Query("SELECT w FROM Workload w WHERE w.status = 'PENDING' ORDER BY w.createdAt ASC")
    List<Workload> findPendingWorkloadsOrderedByCreatedAt();

    List<Workload> findByStatusOrderByCreatedAtAsc(Workload.WorkloadStatus status);
}
