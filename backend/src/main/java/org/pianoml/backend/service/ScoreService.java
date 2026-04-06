package org.pianoml.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.mapper.AuthorMapper;
import org.pianoml.backend.mapper.GenreMapper;
import org.pianoml.backend.mapper.ScoreMapper;
import org.pianoml.backend.model.*;
import org.pianoml.backend.repository.GenreRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserPlayCountRepository;
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
  private UserPlayCountRepository userPlayCountRepository;

  @Autowired
  private AuthorService authorService;

  @Autowired
  private GenreRepository genreRepository;

  @Autowired
  private ScoreMapper scoreMapper;

  @Autowired
  private GenreMapper genreMapper;

  @Autowired
  private AuthorMapper authorMapper;

  @Autowired
  private PackService packService;

  public static String makeBucketKeyFromScore(Score score) {
    String secondId = score.getMbid() != null ? score.getMbid().toString() : score.getId().toString();
    return "scores/" + score.getOwner().getId() + "/" + secondId + "/" + score.getVersion() + ".zip";
  }

  @Transactional
  public ScoreApiInfo createScore(ScoreApiInfo scoreApiInfo, User userId) {
    if (scoreApiInfo.getVersion() == null) {
      // check if score exists
      if (scoreApiInfo.getMbid() != null) {
        int candidateCount = scoreRepository.countScoreByMbidAndOwner(UUID.fromString(scoreApiInfo.getMbid()), userId);
        scoreApiInfo.setVersion(candidateCount + 1);
      } else {
        scoreApiInfo.setVersion(1); // TODO maybe increment on name ?
      }
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
    score.setPublicDomain(true);
    if (score.getAuthor().getLifeSpanEnd() != null) {
      // set EU public domain status if possible
      score.setPublicDomain(score.getAuthor().getLifeSpanEnd().isBefore(LocalDate.now().minusYears(70)));
    } else {
      if (score.getAuthor().getLifeSpanBegin() != null) {
        score.setPublicDomain(false);
      }
    }
    score.setPlayCount(0L);


    if (scoreApiInfo.getGenreId() != null) {
      Genre genre = genreRepository.findById(UUID.fromString(scoreApiInfo.getGenreId()))
        .orElseThrow(() -> new RuntimeException("Genre not found"));
      score.setGenre(genre);
    }

    // Generate unique immutable slug
    SlugUtils.createUniqueSlug(score, scoreRepository);
    // Propagate optional musical fields from API model if provided
    if (scoreApiInfo.getTonic() != null) {
      score.setTonic(scoreApiInfo.getTonic());
    }
    if (scoreApiInfo.getMode() != null) {
      score.setMode(scoreApiInfo.getMode());
    }
    if (scoreApiInfo.getFullKey() != null) {
      score.setFullKey(scoreApiInfo.getFullKey());
    }

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
        if (scoreApiInfo.getVersion() == null) {
          scoreApiInfo.setVersion(1);
        }

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
        if (scoreApiInfo.getDescription() != null) {
          score.setDescription(scoreApiInfo.getDescription());
        }
        score.setAuthor(score.getAuthor());
        score.setGrade(scoreApiInfo.getGrade());
        score.setStudyTracks(ScoreMapper.integerListToString(scoreApiInfo.getStudyTracks()));
        score.setTempo(scoreApiInfo.getTempo());
        // Update optional musical fields only when provided (avoid overwriting with null)
        if (scoreApiInfo.getTonic() != null) {
          score.setTonic(scoreApiInfo.getTonic());
        }
        if (scoreApiInfo.getMode() != null) {
          score.setMode(scoreApiInfo.getMode());
        }
        if (scoreApiInfo.getFullKey() != null) {
          score.setFullKey(scoreApiInfo.getFullKey());
        }
        Score updatedScore = scoreRepository.save(score);
        return scoreMapper.toScoreApiInfo(updatedScore);
      });
  }

  public List<ScoreApiInfo> searchScores(String keyword, String ownerId, String genreId, String artist, String artistSlug, String genreSlug, Boolean etude, String gradeStart, String gradeEnd, String tempo, String fullKey, String orderBy, Integer offset, Integer limit, User user, List<Integer> tracks, String description) {
    return scoreRepository.findWithSomeCriterias(keyword, ownerId, genreId, artist, artistSlug, genreSlug, etude, gradeStart, gradeEnd, tempo, fullKey, orderBy, offset, limit, user, tracks, description)
      .stream()
      .map(scoreMapper::toScoreApiInfo)
      .collect(Collectors.toList());
  }

  public List<String> getFullKeys() {
    return scoreRepository.findDistinctFullKeys();
  }

  public void packAttachmentToScore(Score score, String type, InputStream inputStream, Boolean makeFingering) throws IOException {
    String key = makeBucketKeyFromScore(score);

    PackScriptDto packScriptDto = new PackScriptDto(inputStream, score, type, makeFingering);
    String filename = null;
    if (type.equals("pdf")) {
      // New workload-based processing for PDF
      packService.packPDFWorkload(packScriptDto, key);
      log.info("Successfully created PDF workload for score: {}", score.getId());
    } else if (type.equals("image")) {
      packService.packImageWorkload(packScriptDto, key);
    } else {
      try {
        if (type.equals("midi")) {
          filename = packService.packMidi(packScriptDto);
        } else if (type.equals("musicxml")) {
          filename = packService.packMusicXml(packScriptDto);
        } else if (type.equals("mxl")) {
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
    try {
      Optional<byte[]> optMetadata = getAttachmentFromScore(score, "metadata.json");
      if (optMetadata.isPresent()) {
        String metadataStr = new String(optMetadata.get());
        ObjectMapper mapper = new ObjectMapper();
        JsonNode node = mapper.readTree(metadataStr);

        Integer tracks = node.has("tracks_count") && !node.get("tracks_count").isNull()
          ? node.get("tracks_count").asInt()
          : 0;
        int durationSeconds = 0;
        if (node.has("duration_seconds") && !node.get("duration_seconds").isNull()) {
          // duration_seconds may be integer or floating in the metadata; handle both
          try {
            durationSeconds = (int) Math.round(node.get("duration_seconds").asDouble(0));
          } catch (Exception ex) {
            durationSeconds = node.get("duration_seconds").asInt(0);
          }
        }
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

        // New: parse optional analysis block and set tonic/mode/fullKey
        if (node.has("analysis") && node.get("analysis").isObject()) {
          JsonNode analysis = node.get("analysis");
          String tonic = analysis.has("tonic") && !analysis.get("tonic").isNull()
            ? analysis.get("tonic").asText()
            : null;
          String mode = analysis.has("mode") && !analysis.get("mode").isNull()
            ? analysis.get("mode").asText()
            : null;
          String fullKey = null;
          if (analysis.has("full_key") && !analysis.get("full_key").isNull()) {
            fullKey = analysis.get("full_key").asText();
          } else if (analysis.has("fullKey") && !analysis.get("fullKey").isNull()) {
            fullKey = analysis.get("fullKey").asText();
          } else if (analysis.has("key") && !analysis.get("key").isNull()) {
            fullKey = analysis.get("key").asText();
          }

          // Only set if at least one of the fields is present to avoid overwriting existing data with nulls
          if (tonic != null || mode != null || fullKey != null) {
            score.setTonic(tonic);
            score.setMode(mode);
            score.setFullKey(fullKey);
          }
        }
        if (node.has("harmony") && node.get("harmony").isArray()) {
          score.setHarmony(node.get("harmony").toString());
        }

        scoreRepository.save(score);
      } else {
        log.warn("No metadata found for score: {}", score.getId());
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
      log.warn("S3Exception while getting object {}: {}", key, e.getMessage());
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

    // Delete user play counts first to avoid foreign key constraint violation
    userPlayCountRepository.deleteByScoreId(id);
    log.info("Successfully deleted user play counts for score: " + id);

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


  public List<AuthorWithScoreCount> getAuthorsWithScoreCounts(User user, Integer offset, Integer limit, java.util.List<Integer> tracks) {
    return getAuthorsWithScoreCounts(user, offset, limit, tracks, null, null);
  }

  public List<AuthorWithScoreCount> getAuthorsWithScoreCounts(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, String fullKey) {
    return getAuthorsWithScoreCounts(user, offset, limit, tracks, fullKey, null);
  }

  public List<AuthorWithScoreCount> getAuthorsWithScoreCounts(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, String fullKey, String slug) {
    int off = offset != null ? Math.max(0, offset) : 0;
    Integer lim = limit != null && limit > 0 ? limit : null;

    List<Object[]> rows = scoreRepository.countScoresGroupedByAuthor(user, lim == null ? null : off, lim, tracks, fullKey, slug);
    return rows.stream().map(row -> {
      org.pianoml.backend.entity.Author author = (org.pianoml.backend.entity.Author) row[0];
      Long count = (Long) row[1];
      OffsetDateTime maxUploadedAt = (OffsetDateTime) row[2];
      AuthorApiInfo authorApiInfo = authorMapper.toAuthorApiInfo(author);
      AuthorWithScoreCount out = new AuthorWithScoreCount();
      out.setAuthor(authorApiInfo);
      out.setCount(count);
      out.setUpdatedAt(maxUploadedAt);
      return out;
    }).toList();
  }

  public List<ScoreGenreBrowseGet200ResponseInner> getGenresWithScoreCounts(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, java.util.List<UUID> genreFilter) {
    return getGenresWithScoreCounts(user, offset, limit, tracks, genreFilter, null, null);
  }

  public List<ScoreGenreBrowseGet200ResponseInner> getGenresWithScoreCounts(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, java.util.List<UUID> genreFilter, String fullKey) {
    return getGenresWithScoreCounts(user, offset, limit, tracks, genreFilter, fullKey, null);
  }

  public List<ScoreGenreBrowseGet200ResponseInner> getGenresWithScoreCounts(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, java.util.List<UUID> genreFilter, String fullKey, String slug) {
    int off = offset != null ? Math.max(0, offset) : 0;
    Integer lim = limit != null && limit > 0 ? limit : null;

    List<Object[]> rows = scoreRepository.countScoresGroupedByGenre(user, lim == null ? null : off, lim, tracks, genreFilter, fullKey, slug);
    return rows.stream().map(row -> {
      Genre genre = (Genre) row[0];
      Long count = (Long) row[1];
      OffsetDateTime maxUploadedAt = (OffsetDateTime) row[2];
      ScoreGenreBrowseGet200ResponseInner out = new ScoreGenreBrowseGet200ResponseInner();
      if (genre != null) {
        GenreApiInfo genreApiInfo = genreMapper.toGenreApiInfo(genre);
        out.setGenre(genreApiInfo);
      } else {
        // Cas spécial : genre est null
        out.setGenre(null);
      }
      out.setCount(count);
      out.setUpdatedAt(maxUploadedAt);
      return out;
    }).toList();
  }

  /**
   * Return counts of visible public-domain and copyrighted scores as the API model.
   */
  public ScoreStatsGet200Response getScoreStats() {
    Long[] counts = scoreRepository.countPublicAndCopyrighted();
    ScoreStatsGet200Response resp = new ScoreStatsGet200Response();
    resp.setPublicDomain(counts[0]);
    resp.setCopyrighted(counts[1]);
    return resp;
  }

  /**
   * Incrémente le compteur de lecture pour un score donné.
   * Si un utilisateur est fourni, incrémente également le compteur par utilisateur.
   *
   * @param scoreId L'ID du score
   * @param user    L'utilisateur (optionnel, peut être null)
   */
  @Transactional
  public void incrementPlayCount(UUID scoreId, User user) {
    // Incrémenter le compteur global du score
    scoreRepository.incrementPlayCount(scoreId);

    // Si un utilisateur est connecté, incrémenter aussi le compteur par utilisateur
    if (user != null) {
      userPlayCountRepository.incrementPlayCount(user.getId(), scoreId);
    }
  }
}
