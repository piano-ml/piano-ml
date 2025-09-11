package org.pianoml.backend.service;

import jakarta.transaction.Transactional;
import jakarta.validation.constraints.NotNull;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.exception.EntityAlreadyExistsException;
import org.pianoml.backend.exception.MusicBrainzException;
import org.pianoml.backend.mapper.ScoreMapper;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.UUID;
import java.util.List;
import java.util.Optional;
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

  @Autowired
  private WorkloadRepository workloadRepository;

  @Transactional
  public ScoreApiInfo createScore(ScoreApiInfo scoreApiInfo, User userId) {
    Score score = scoreMapper.toScore(scoreApiInfo);
    score.setOwner(userId);
    if (scoreApiInfo.getAuthorId() != null) {
      Author author = authorService.maybeCreateAuthor(UUID.fromString(scoreApiInfo.getAuthorId()));
      score.setAuthor(author);
    }
    if (scoreApiInfo.getVersion()==null) {
      score.setVersion(1);
    }

    if (scoreApiInfo.getGenreId() != null) {
      Genre genre = genreRepository.findById(UUID.fromString(scoreApiInfo.getGenreId()))
        .orElseThrow(() -> new RuntimeException("Genre not found"));
      score.setGenre(genre);
    }
    // check if score exists
    Score candidate = scoreRepository.findScoreByMbidAndOwnerAndVersion(score.getMbid(), score.getOwner(), score.getVersion())
      .orElse(null);
    if (candidate != null) {
      score.setId(candidate.getId()) ;
    }

    Score savedScore = scoreRepository.save(score);
    return scoreMapper.toScoreApiInfo(savedScore);

  }



  public Optional<ScoreApiInfo> getScore(UUID id) {
    return scoreRepository.findById(id)
      .map(scoreMapper::toScoreApiInfo);
  }

  public Optional<ScoreApiInfo> updateScore(UUID id, ScoreApiInfo scoreApiInfo) {
    return scoreRepository.findById(id)
      .map(score -> {
        // Update score fields from scoreApiInfo
        score.setTitle(scoreApiInfo.getTitle());
        score.setVersion(scoreApiInfo.getVersion());
        score.setTracksCount(scoreApiInfo.getTracksCount());
        score.setHandSeparated(scoreApiInfo.getHandSeparated());
        score.setHasLyrics(scoreApiInfo.getHasLyrics());
        score.setGrade(scoreApiInfo.getGrade());
        score.setHasFiles(scoreApiInfo.getHasFiles());
        score.setImage(scoreApiInfo.getImage() != null ? scoreApiInfo.getImage().toString() : null);
        // Handle studyTracks update (List<Integer> -> comma-separated String)
        score.setStudyTracks(ScoreMapper.integerListToString(scoreApiInfo.getStudyTracks()));

        Score updatedScore = scoreRepository.save(score);
        return scoreMapper.toScoreApiInfo(updatedScore);
      });
  }

  public List<ScoreApiInfo> searchScores(String keyword, String ownerId ,String genreId, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit) {
    return scoreRepositoryCustom.findByCriterias(keyword, ownerId, genreId, gradeStart, gradeEnd, offset, limit)
      .stream()
      .map(scoreMapper::toScoreApiInfo)
      .collect(Collectors.toList());
  }

  public String makeBucketKeyFromScore(Score score) {
    return "scores/" + score.getOwner().getId() + "/" + score.getMbid() + "/" + score.getVersion() + ".zip";
  }

  public void packAttachmentToScore(Score score, String type, InputStream inputStream) throws IOException {
    String key = makeBucketKeyFromScore(score);

    PackScriptDto packScriptDto = new PackScriptDto(inputStream, score);

    if (type.equals("pdf")) {
      // New workload-based processing for PDF
      packService.packPDFWorkload(packScriptDto, key);
      log.info("Successfully created PDF workload for score: {}", score.getId());
    } else {
      // Existing logic for midi and musicxml
      String filename = null;
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
        score.setHasFiles(true);
        scoreRepository.save(score);
        log.info("successfully sent to bucket " + key);
      } finally {
        if (filename != null) {
          Files.deleteIfExists(Paths.get(filename));
        }
      }
    }
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
