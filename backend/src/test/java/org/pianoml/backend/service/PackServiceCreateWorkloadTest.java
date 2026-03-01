package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.Workload;
import org.pianoml.backend.repository.WorkloadRepository;

import java.io.ByteArrayInputStream;
import java.lang.reflect.Method;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PackServiceCreateWorkloadTest {

  @Mock
  private WorkloadRepository workloadRepository;

  @InjectMocks
  private PackService packService;

  @Captor
  private ArgumentCaptor<Workload> workloadCaptor;

  @BeforeEach
  void setUp() throws Exception {
    // set bucketName to avoid null issues (not used here but keeps object consistent)
    java.lang.reflect.Field bucketField = PackService.class.getDeclaredField("bucketName");
    bucketField.setAccessible(true);
    bucketField.set(packService, "test-bucket");

    // Make save return the passed workload
    when(workloadRepository.save(any(Workload.class))).thenAnswer(i -> i.getArgument(0));
  }

  @Test
  void createWorkload_privateMethod_returnsWorkloadWithExpectedFields() throws Exception {
    // Arrange: build PackScriptDto with Score containing a valid UUID
    UUID scoreId = UUID.randomUUID();
    Score score = new Score();
    score.setId(scoreId);
    User owner = new User();
    owner.setId(UUID.randomUUID());
    score.setOwner(owner);
    score.setTitle("Titre");
    Author author = new Author();
    author.setName("Auteur");
    score.setAuthor(author);
    score.setStudyTracks("1");

    PackScriptDto dto = new PackScriptDto(new ByteArrayInputStream(new byte[]{1,2,3}), score, "pdf", true);

    // Access private method createWorkload via reflection
    Method createWorkloadMethod = PackService.class.getDeclaredMethod("createWorkload", String.class, PackScriptDto.class, int.class);
    createWorkloadMethod.setAccessible(true);

    int expectedSize = 4321;

    // Act
    Object result = createWorkloadMethod.invoke(packService, Workload.KIND_OMR_PDF, dto, expectedSize);
    assertNotNull(result);
    assertTrue(result instanceof Workload);
    Workload workload = (Workload) result;

    // Assert fields on returned workload
    assertEquals(Workload.KIND_OMR_PDF, workload.getKind());
    assertEquals(scoreId, workload.getScoreId());
    assertEquals(true, workload.getMakeFingerings());
    assertNotNull(workload.getCreatedAt());
    assertEquals(Workload.WorkloadStatus.PENDING, workload.getStatus());
    assertEquals(expectedSize, workload.getWorkloadSize());

    // Verify repository.save was called once with the workload
    verify(workloadRepository, times(1)).save(workloadCaptor.capture());
    Workload saved = workloadCaptor.getValue();
    assertEquals(workload, saved);
  }
}

