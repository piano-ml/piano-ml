package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.model.WorkloadApiInfo;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Mapper(componentModel = "spring")
public interface WorkloadMapper {

  @Mapping(source = "createdAt", target = "createdAt", qualifiedByName = "localDateTimeToOffsetDateTime")
  @Mapping(source = "scoreId", target = "scoreId", qualifiedByName = "uuidToString")
  @Mapping(source = "status", target = "status", qualifiedByName = "workloadStatusToStatusEnum")
  WorkloadApiInfo toApiInfo(Workload workload);

  @Mapping(source = "createdAt", target = "createdAt", qualifiedByName = "offsetDateTimeToLocalDateTime")
  @Mapping(source = "scoreId", target = "scoreId", qualifiedByName = "stringToUuid")
  @Mapping(source = "status", target = "status", qualifiedByName = "statusEnumToWorkloadStatus")
  Workload toEntity(WorkloadApiInfo apiInfo);

  @Named("localDateTimeToOffsetDateTime")
  default OffsetDateTime localDateTimeToOffsetDateTime(LocalDateTime localDateTime) {
    return localDateTime != null ? localDateTime.atOffset(ZoneOffset.UTC) : null;
  }

  @Named("offsetDateTimeToLocalDateTime")
  default LocalDateTime offsetDateTimeToLocalDateTime(OffsetDateTime offsetDateTime) {
    return offsetDateTime != null ? offsetDateTime.toLocalDateTime() : null;
  }

  @Named("uuidToString")
  default String uuidToString(UUID uuid) {
    return uuid != null ? uuid.toString() : null;
  }

  @Named("stringToUuid")
  default UUID stringToUuid(String uuidString) {
    return uuidString != null ? UUID.fromString(uuidString) : null;
  }

  @Named("workloadStatusToStatusEnum")
  default WorkloadApiInfo.StatusEnum workloadStatusToStatusEnum(Workload.WorkloadStatus status) {
    return status != null ? WorkloadApiInfo.StatusEnum.fromValue(status.name()) : null;
  }

  @Named("statusEnumToWorkloadStatus")
  default Workload.WorkloadStatus statusEnumToWorkloadStatus(WorkloadApiInfo.StatusEnum statusEnum) {
    return statusEnum != null ? Workload.WorkloadStatus.valueOf(statusEnum.getValue()) : null;
  }
}
