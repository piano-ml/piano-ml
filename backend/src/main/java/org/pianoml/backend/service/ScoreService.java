package org.pianoml.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.mapper.ScoreMapper;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.GenreRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.ScoreRepositoryCustom;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Slf4j
@Service
public class ScoreService {

  @Autowired
  private S3Client s3Client;

  @Value("${aws.s3.bucket-name:'no-bucket'}")
  private String bucketName;

  @Autowired
  private ScoreRepository scoreRepository;

  @Autowired
  private ScoreRepositoryCustom scoreRepositoryCustom;

  @Autowired
  private AuthorService authorService;

  @Autowired
  private GenreRepository genreRepository;

  @Autowired
  private ScoreMapper scoreMapper;

  @Autowired
  private PackService packService;

  public static String makeBucketKeyFromScore(Score score) {
    return "scores/" + score.getOwner().getId() + "/" + score.getMbid() + "/" + score.getVersion() + ".zip";
  }

  @Transactional
  public ScoreApiInfo createScore(ScoreApiInfo scoreApiInfo, User userId) {
    if (scoreApiInfo.getVersion() == null) {
      // check if score exists
      int candidateCount = scoreRepository.countScoreByMbidAndOwner(UUID.fromString(scoreApiInfo.getMbid()), userId);
      scoreApiInfo.setVersion(candidateCount + 1);
    }
    Score score = scoreMapper.toScore(scoreApiInfo);
    score.setOwner(userId);
    if (scoreApiInfo.getAuthorId() != null) {
      Author author = authorService.maybeCreateAuthor(UUID.fromString(scoreApiInfo.getAuthorId()));
      score.setAuthor(author);
    }

    if (scoreApiInfo.getExercise() != null) {
      score.setExercise(scoreApiInfo.getExercise());
    } else {
      score.setExercise(false);
    }
    if (score.getAuthor().getLifeSpanEnd()!=null) {
      // set EU public domain status if possible
      score.setPublicDomain(score.getAuthor().getLifeSpanEnd().isAfter(LocalDate.now().minusYears(70)));
    }
    if (scoreApiInfo.getGenreId() != null) {
      Genre genre = genreRepository.findById(UUID.fromString(scoreApiInfo.getGenreId()))
        .orElseThrow(() -> new RuntimeException("Genre not found"));
      score.setGenre(genre);
    }

    // Generate unique immutable slug
    String uniqueSlug = SlugUtils.createUniqueSlug(score, scoreRepository);
    score.setImmutableSlug(uniqueSlug);
    score.setMutableSlug(uniqueSlug); // Initially, mutable slug is the same as immutable slug
    Score savedScore = scoreRepository.save(score);
    return scoreMapper.toScoreApiInfo(savedScore);

  }

  public Optional<ScoreApiInfo> getScore(UUID id) {
    return scoreRepository.findById(id)
      .map(scoreMapper::toScoreApiInfo);
  }

  public Optional<ScoreApiInfo> getScoreBySlug(String slug) {
    return scoreRepository.findByImmutableSlug(slug)
      .map(scoreMapper::toScoreApiInfo);
  }

  public Optional<ScoreApiInfo> updateScore(UUID id, ScoreApiInfo scoreApiInfo) {
    return scoreRepository.findById(id)
      .map(score -> {
        // Update score fields from scoreApiInfo
        score.setTitle(scoreApiInfo.getTitle());
        if (scoreApiInfo.getGenreId() != null) {
          try {
            UUID.fromString(scoreApiInfo.getGenreId());
            Genre genre = genreRepository.findById(UUID.fromString(scoreApiInfo.getGenreId())).orElse(null);
            score.setGenre(genre);
          } catch (IllegalArgumentException e) {
            score.setGenre(null);
          }
        }
        if (scoreApiInfo.getAuthorId() != null && !scoreApiInfo.getAuthorId().equals(score.getAuthor().getId().toString())) {
          Author author = authorService.maybeCreateAuthor(UUID.fromString(scoreApiInfo.getAuthorId()));
          score.setAuthor(author);
        }
        if (scoreApiInfo.getExercise() != null) {
          score.setExercise(scoreApiInfo.getExercise());
        }
        if (scoreApiInfo.getPublicDomain() != null) {
          score.setPublicDomain(scoreApiInfo.getPublicDomain());
        }
        score.setAuthor(score.getAuthor());
        score.setGrade(scoreApiInfo.getGrade());
        score.setStudyTracks(ScoreMapper.integerListToString(scoreApiInfo.getStudyTracks()));
        score.setTempo(scoreApiInfo.getTempo());
        Score updatedScore = scoreRepository.save(score);
        return scoreMapper.toScoreApiInfo(updatedScore);
      });
  }

  public List<ScoreApiInfo> searchScores(String keyword, String ownerId, String genreId, String artist, Boolean etude, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit, User user) {
    return scoreRepositoryCustom.findByCriterias(keyword, ownerId, genreId, artist, etude, gradeStart, gradeEnd, offset, limit, user )
      .stream()
      .map(scoreMapper::toScoreApiInfo)
      .collect(Collectors.toList());
  }

  public void packAttachmentToScore(Score score, String type, InputStream inputStream) throws IOException {
    String key = makeBucketKeyFromScore(score);

    PackScriptDto packScriptDto = new PackScriptDto(inputStream, score);
    String filename = null;
    if (type.equals("pdf")) {
      // New workload-based processing for PDF
      packService.packPDFWorkload(packScriptDto, key);
      log.info("Successfully created PDF workload for score: {}", score.getId());
    } else if (type.equals("image")) {
      packService.packImageWorkload(packScriptDto, key);
    } else {
      // Existing logic for midi and musicxml

      try {
        if (type.equals("midi")) {
          filename = packService.packMidi(packScriptDto);
        } else if (type.equals("musicxml")) {
          filename = packService.packMusicXml(packScriptDto);
        } else {
          throw new RuntimeException("Unsupported type " + type);
        }
        log.info("successfully generated " + filename);
        s3Client.putObject(PutObjectRequest.builder().bucket(bucketName).key(key).build(),
          RequestBody.fromFile(new File(filename)));
        score = this.infosFromMetadata(score);
        score.setHasFiles(true);
        score.setUploadedAt(OffsetDateTime.now());
        scoreRepository.save(score);
        log.info("successfully sent to bucket " + key);
      } finally {
        if (filename != null) {
          Files.deleteIfExists(Paths.get(filename));
        }
      }
    }
  }

  Score infosFromMetadata(Score score) {
    Optional<byte[]> optMetadata = null;
    try {
      optMetadata = getAttachmentFromScore(score, "metadata.json");
      if (optMetadata.isPresent()) {
        String metadataStr = new String(optMetadata.get());
        ObjectMapper mapper = new ObjectMapper();
        JsonNode node = mapper.readTree(metadataStr);

        Integer tracks = node.has("tracks_count") && !node.get("tracks_count").isNull()
          ? node.get("tracks_count").asInt()
          : 0;
        int durationSeconds = node.has("duration_seconds") && !node.get("duration_seconds").isNull()
          ? node.get("duration_seconds").asInt()
          : 0;
        Integer measureCount = node.has("measures_count") && !node.get("measures_count").isNull()
          ? node.get("measures_count").asInt()
          : null;
        Integer tempo = node.has("tempo") && !node.get("tempo").isNull()
          ? node.get("tempo").asInt()
          : null;
        Boolean hasLyrics = node.has("has_lyrics") && !node.get("has_lyrics").isNull()
          ? node.get("has_lyrics").asBoolean()
          : null;

        score.setTracksCount(tracks);
        score.setDuration(durationSeconds);
        score.setMeasuresCount(measureCount);
        score.setHasLyrics(hasLyrics);
        score.setTempo(tempo);
        scoreRepository.save(score);
      } else {
        log.warn("No metadata found for score: " + score.getId());
      }
    } catch (Exception e) {
      log.error("No metadata found for score:", e);
    }
    return score;
  }

  public Optional<byte[]> getAttachmentFromScore(Score score, String type) throws IOException {
    String key = makeBucketKeyFromScore(score);
    try {
      byte[] zipData = s3Client.getObject(GetObjectRequest.builder().bucket(bucketName).key(key).build()).readAllBytes();
      try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipData))) {
        ZipEntry entry;
        while ((entry = zis.getNextEntry()) != null) {
          if (entry.getName().endsWith(type)) {
            return Optional.of(zis.readAllBytes());
          }
        }
      }
    } catch (S3Exception e) {
      e.printStackTrace();
      if (e.statusCode() == 404) {
        return Optional.empty();
      }
      throw e;
    }
    return Optional.empty();
  }

  @Transactional
  public boolean deleteScore(UUID id, User authenticatedUser) {
    Optional<Score> scoreOpt = scoreRepository.findById(id);
    if (scoreOpt.isEmpty()) {
      return false;
    }

    Score score = scoreOpt.get();

    // Check if user is owner or has admin role
    boolean isOwner = score.getOwner().getId().equals(authenticatedUser.getId());
    boolean isAdmin = Arrays.stream(authenticatedUser.getRoles().split(","))
      .anyMatch(role -> "ADMIN".equals(role.trim()));

    if (!isOwner && !isAdmin) {
      throw new RuntimeException("Unauthorized: Only owner or admin can delete this score");
    }

    // Delete from S3 if files exist
    if (score.getHasFiles() != null && score.getHasFiles()) {
      try {
        String key = makeBucketKeyFromScore(score);
        s3Client.deleteObject(software.amazon.awssdk.services.s3.model.DeleteObjectRequest.builder()
          .bucket(bucketName)
          .key(key)
          .build());
        log.info("Successfully deleted S3 object: " + key);
      } catch (S3Exception e) {
        log.warn("Failed to delete S3 object for score " + id + ": " + e.getMessage());
        // Continue with database deletion even if S3 deletion fails
      }
    }

    // Delete from database
    scoreRepository.delete(score);
    log.info("Successfully deleted score: " + id);
    return true;
  }
}
