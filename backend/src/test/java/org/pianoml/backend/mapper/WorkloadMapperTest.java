package org.pianoml.backend.mapper;

import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.model.WorkloadApiInfo;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkloadMapperTest {

  private final WorkloadMapper mapper = new WorkloadMapperImpl();

  @Test
  void toApiInfo_exposesMakeFingerings() {
    Workload workload = new Workload();
    workload.setScoreId(UUID.randomUUID());
    workload.setStatus(Workload.WorkloadStatus.PENDING);
    workload.setMakeFingerings(false);

    WorkloadApiInfo api = mapper.toApiInfo(workload);

    assertFalse(api.getMakeFingerings());
    assertEquals(WorkloadApiInfo.StatusEnum.PENDING, api.getStatus());
  }

  @Test
  void toEntity_mapsMakeFingerings() {
    WorkloadApiInfo api = new WorkloadApiInfo();
    api.setMakeFingerings(true);

    assertTrue(mapper.toEntity(api).getMakeFingerings());
  }

  @Test
  void legacyWorkloadWithoutFlag_mapsToNull() {
    assertNull(mapper.toApiInfo(new Workload()).getMakeFingerings());
  }
}
