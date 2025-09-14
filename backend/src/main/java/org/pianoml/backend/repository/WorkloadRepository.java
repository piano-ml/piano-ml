package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Workload;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkloadRepository extends JpaRepository<Workload, Integer> {


  @Query(value = "SELECT * FROM \"pianoml\".workload w WHERE w.status = 'PENDING' ORDER BY w.created_at ASC", nativeQuery = true)
  List<Workload> findPendingWorkloadsOrderedByCreatedAt();

  Optional<Workload> findByScoreId(UUID scoreID);
}
