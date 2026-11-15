package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** The untouched upload kept in the score zip as {@code ori.<ext>}: lookup, content type, access rule. */
class ScoreServiceOriginalFileTest {

  private S3Client s3Client;
  private ScoreService scoreService;
  private Score score;

  @BeforeEach
  void setUp() {
    s3Client = mock(S3Client.class);
    scoreService = new ScoreService();
    ReflectionTestUtils.setField(scoreService, "s3Client", s3Client);
    ReflectionTestUtils.setField(scoreService, "bucketName", "bucket");

    User owner = new User();
    owner.setId(UUID.randomUUID());
    score = new Score();
    score.setId(UUID.randomUUID());
    score.setOwner(owner);
    score.setVersion(1);
  }

  private void zipInBucket(Map<String, String> entries) throws IOException {
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    try (ZipOutputStream zos = new ZipOutputStream(baos)) {
      for (Map.Entry<String, String> e : entries.entrySet()) {
        zos.putNextEntry(new ZipEntry(e.getKey()));
        zos.write(e.getValue().getBytes(StandardCharsets.UTF_8));
        zos.closeEntry();
      }
    }
    when(s3Client.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(
      GetObjectResponse.builder().build(), AbortableInputStream.create(new ByteArrayInputStream(baos.toByteArray()))));
  }

  @Test
  void getOriginalFromScore_returnsOriEntryWithItsName() throws IOException {
    Map<String, String> entries = new LinkedHashMap<>();
    entries.put("score.pdf", "generated-pdf");
    entries.put("score.midi", "generated-midi");
    entries.put("metadata.json", "{}");
    entries.put("ori.mxl", "uploaded-mxl");
    zipInBucket(entries);

    Optional<ScoreService.ScoreFile> original = scoreService.getOriginalFromScore(score);

    assertTrue(original.isPresent());
    assertEquals("ori.mxl", original.get().filename());
    assertEquals("uploaded-mxl", new String(original.get().content(), StandardCharsets.UTF_8));
    verify(s3Client).getObject(GetObjectRequest.builder().bucket("bucket")
      .key(ScoreService.makeBucketKeyFromScore(score)).build());
  }

  @Test
  void getOriginalFromScore_emptyWhenZipHasNoOriginal() throws IOException {
    Map<String, String> entries = new LinkedHashMap<>();
    entries.put("score.pdf", "generated-pdf");
    entries.put("origin.pdf", "not-the-original"); // "ori" prefix alone is not enough: needs "ori."
    zipInBucket(entries);

    assertTrue(scoreService.getOriginalFromScore(score).isEmpty());
  }

  @Test
  void getOriginalFromScore_emptyWhenZipMissingInBucket() throws IOException {
    when(s3Client.getObject(any(GetObjectRequest.class)))
      .thenThrow(S3Exception.builder().statusCode(404).message("NoSuchKey").build());

    assertTrue(scoreService.getOriginalFromScore(score).isEmpty());
  }

  @Test
  void getAttachmentFromScore_neverServesTheOriginalInPlaceOfTheGeneratedFile() throws IOException {
    // ori.pdf comes first: a plain endsWith("pdf") lookup would have returned the upload
    Map<String, String> entries = new LinkedHashMap<>();
    entries.put("ori.pdf", "uploaded-pdf");
    entries.put("score.pdf", "generated-pdf");
    zipInBucket(entries);

    Optional<byte[]> pdf = scoreService.getAttachmentFromScore(score, "pdf");

    assertTrue(pdf.isPresent());
    assertEquals("generated-pdf", new String(pdf.get(), StandardCharsets.UTF_8));
  }

  @Test
  void getAttachmentFromScore_emptyWhenOnlyTheOriginalMatches() throws IOException {
    Map<String, String> entries = new LinkedHashMap<>();
    entries.put("ori.midi", "uploaded-midi");
    entries.put("score.pdf", "generated-pdf");
    zipInBucket(entries);

    assertTrue(scoreService.getAttachmentFromScore(score, "midi").isEmpty());
  }

  @Test
  void isOriginalEntry_matchesOriDotAnything() {
    assertTrue(ScoreService.isOriginalEntry("ori.pdf"));
    assertTrue(ScoreService.isOriginalEntry("folder/ori.png"));
    assertFalse(ScoreService.isOriginalEntry("score.pdf"));
    assertFalse(ScoreService.isOriginalEntry("origin.pdf"));
    assertFalse(ScoreService.isOriginalEntry("ori"));
  }

  @Test
  void originalContentType_followsTheExtension() {
    assertEquals("application/pdf", ScoreService.originalContentType("ori.pdf"));
    assertEquals("image/png", ScoreService.originalContentType("ori.png"));
    assertEquals("image/jpeg", ScoreService.originalContentType("ori.JPG"));
    assertEquals("audio/midi", ScoreService.originalContentType("ori.midi"));
    assertEquals("audio/midi", ScoreService.originalContentType("ori.mid"));
    assertEquals("application/vnd.recordare.musicxml+xml", ScoreService.originalContentType("ori.musicxml"));
    assertEquals("application/vnd.recordare.musicxml", ScoreService.originalContentType("ori.mxl"));
    assertEquals("application/octet-stream", ScoreService.originalContentType("ori.bin"));
    assertEquals("application/octet-stream", ScoreService.originalContentType("ori"));
  }

  @Test
  void isOwnerOrAdmin_ownerAndAdminOnly() {
    User owner = score.getOwner();
    User admin = new User();
    admin.setId(UUID.randomUUID());
    admin.setRoles("USER, ADMIN");
    User other = new User();
    other.setId(UUID.randomUUID());
    other.setRoles("USER");
    User noRoles = new User();
    noRoles.setId(UUID.randomUUID());

    assertTrue(ScoreService.isOwnerOrAdmin(score, owner));
    assertTrue(ScoreService.isOwnerOrAdmin(score, admin));
    assertFalse(ScoreService.isOwnerOrAdmin(score, other));
    assertFalse(ScoreService.isOwnerOrAdmin(score, noRoles));
    assertFalse(ScoreService.isOwnerOrAdmin(score, null));
  }
}
