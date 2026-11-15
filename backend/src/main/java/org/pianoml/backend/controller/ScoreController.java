package org.pianoml.backend.controller;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.pianoml.backend.api.ScoreApi;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.YoutubeRank;
import org.pianoml.backend.exception.EntityAlreadyExistsException;
import org.pianoml.backend.exception.UserNotLoggedInException;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.model.ScorePlayStatsPostRequest;
import org.pianoml.backend.model.ScoreStatsGet200Response;
import org.pianoml.backend.model.YoutubeVideoApiInfo;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.pianoml.backend.service.YoutubeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ScoreController implements ScoreApi {

  private static final Logger log = LoggerFactory.getLogger(ScoreController.class);
  /**
   * Files of a copyrighted score (not public domain) only its owner and admins may download. The printable PDF only:
   * MIDI and MusicXML feed the practice page, which stays open to everyone.
   */
  static final java.util.Set<String> OWNER_ONLY_WHEN_COPYRIGHTED = java.util.Set.of("pdf");
  /** Download type of the file uploaded at import, restricted to the score owner and admins. */
  static final String ORIGINAL_TYPE = "original";
  private static final java.util.Set<String> YOUTUBE_ACTIONS = java.util.Set.of("upvote", "downvote", "view", "report");

  private final ScoreService scoreService;

  private final YoutubeService youtubeService;

  private final UserRepository userRepository;

  private final AccountService userService;

  private final ScoreRepository scoreRepository;

  private final YoutubeRankRepository youtubeRankRepository;


  @Override
  public ResponseEntity<ScoreApiInfo> scoreYoutubeEdit(String id, String youtubeId, String action, Object body) {
    UUID scoreId;
    try {
      scoreId = UUID.fromString(id);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().build();
    }

    // Validate the action first: an unknown one used to answer 400 after creating a ranking row anyway
    if (!YOUTUBE_ACTIONS.contains(action)) {
      log.warn("Unknown action '{}' for scoreYoutubeEdit", action);
      return ResponseEntity.badRequest().build();
    }

    // Ensure the score exists
    if (scoreRepository.findById(scoreId).isEmpty()) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    // Upsert the YoutubeRank row (get or create)
    YoutubeRank youtubeRank = youtubeRankRepository
        .findByScoreIdAndVideoId(scoreId, youtubeId)
        .orElseGet(() -> {
          YoutubeRank newEntry = new YoutubeRank(scoreId, youtubeId);
          return youtubeRankRepository.save(newEntry);
        });

    switch (action) {
      case "upvote":
        youtubeRankRepository.incrementRank(scoreId, youtubeId);
        break;
      case "downvote":
        youtubeRankRepository.decrementRank(scoreId, youtubeId);
        break;
      case "view":
        youtubeRankRepository.incrementViews(scoreId, youtubeId);
        break;
      case "report":
        youtubeRankRepository.incrementReports(scoreId, youtubeId);
        break;
      default:
        log.warn("Unknown action '{}' for scoreYoutubeEdit", action);
        return ResponseEntity.badRequest().build();
    }

    return scoreService.getScore(scoreId)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).build());
  }

  @Override
  public ResponseEntity<List<YoutubeVideoApiInfo>> scoreIdVideoGet(String id) {
    UUID scoreId;
    try {
      scoreId = UUID.fromString(id);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().build();
    }

    Optional<ScoreApiInfo> optScore = scoreService.getScore(scoreId);
    if (optScore.isEmpty()) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
    ScoreApiInfo score = optScore.get();
    try {
      List<YoutubeVideoApiInfo> videos = youtubeService.searchVideos(scoreId, score.getTitle(), score.getAuthor());
      return ResponseEntity.ok(videos);
    } catch (YoutubeService.YoutubeApiException e) {
      log.error("YouTube API error for score {}: {}", id, e.getMessage());
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).build();
    }
  }

  @Override
  public ResponseEntity<ScoreApiInfo> scoreIdGet(String id) {
    return scoreService.getScore(UUID.fromString(id))
      .map(ResponseEntity::ok)
      .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
  }

  // Méthode temporaire sans @Override - sera corrigée une fois que l'interface ScoreApi sera régénérée
  @Override
  public ResponseEntity<ScoreApiInfo> scoreGetBySlug(@PathVariable String slug) {
    return scoreService.getScoreBySlug(slug)
      .map(ResponseEntity::ok)
      .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
  }

  @Override
  public ResponseEntity<ScoreApiInfo> scoreIdPut(String id, ScoreApiInfo scoreApiInfo) {


    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    String userid = authentication.getName();
    User user = userRepository.findById(UUID.fromString(userid)).orElseThrow(EntityNotFoundException::new);

    Optional<ScoreApiInfo> optScore = scoreService.getScore(UUID.fromString(id));
    if (optScore.isEmpty()) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
    ScoreApiInfo score = optScore.get();
    if (!user.getRoles().contains("ADMIN") && !score.getOwnerId().equals(user.getId().toString())) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }


    return scoreService.updateScore(UUID.fromString(id), scoreApiInfo)
      .map(ResponseEntity::ok)
      .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
  }

  @Override
  public ResponseEntity<ScoreApiInfo> scorePost(ScoreApiInfo scoreApiInfo) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    User user = userService.getUserFromAuthentication(authentication);

    // Validate that title is not null
    if (scoreApiInfo.getTitle() == null || scoreApiInfo.getTitle().trim().isEmpty()) {
      throw new IllegalArgumentException("Score title is required and cannot be null or empty");
    }
    if (scoreApiInfo.getAuthorId() == null) {
      throw new IllegalArgumentException("AuthorId is required and cannot be null or empty");
    }


    try {
      if (scoreApiInfo.getHasFiles() == null) {
        scoreApiInfo.setHasFiles(false);
      }
      ScoreApiInfo createdScore = scoreService.createScore(scoreApiInfo, user);
      return new ResponseEntity<>(createdScore, HttpStatus.CREATED);
    } catch (DataIntegrityViolationException e) {
      log.error("Data integrity violation during scorePost:", e);
      throw new EntityAlreadyExistsException("You have already created this score, please consider edit it in account/scores page.");
    }
  }

  @Override
  public ResponseEntity<List<ScoreApiInfo>> scoreSearchGet(String keyword, String ownerId, String genreId, String artist, String artistSlug, String genreSlug, Boolean etude, String gradeStart, String gradeEnd, String tempo, String fullKey, String orderBy, Integer offset, Integer limit, List<Integer> tracks, String description) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    User user;
    try {
      // Use AccountService#getUserFromAuthentication which throws when the user is anonymous or not activated.
      user = userService.getUserFromAuthentication(authentication);
    } catch (UserNotLoggedInException e) {
      // If the user is not logged in or cannot be resolved, keep user = null so only public scores are shown.
      user = null;
    }

    // Forward gradeStart/gradeEnd strings as-is to the service/repository so that:
    //  - null => no filtering on grade
    //  - "NONE" => match scores with grade IS NULL
    List<ScoreApiInfo> scores = scoreService.searchScores(keyword, ownerId, genreId, artist, artistSlug, genreSlug, etude, gradeStart, gradeEnd, tempo, fullKey, orderBy, offset, limit, user, tracks, description);
    return ResponseEntity.ok(scores);
  }

  @Override
  public ResponseEntity<List<String>> scoreGetFullKeyGet() {
    List<String> keys = scoreService.getFullKeys();
    return ResponseEntity.ok(keys);
  }


  @Override
  public ResponseEntity<Void> scoreIdTypeVersionRevisionPost(String id, String type, Integer version, Integer revision, org.springframework.core.io.Resource body, Integer track1, Integer track2, Boolean makeFingering) {
    log.info("{} {} {} {} {} {} {}",id, type, version, revision, track1, track2, makeFingering);
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    String userId = authentication.getName();
    User user = userRepository.findById(UUID.fromString(userId)).orElseThrow(EntityNotFoundException::new);
    Optional<Score> optScore = scoreRepository.findScoreByIdAndOwnerAndVersion(UUID.fromString(id), user, version);
    if (optScore.isEmpty()) {
      log.error("upload attachment failed: score not found for id {}, version {}, owner {}", id, version, userId);
      return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
    if (!optScore.get().getOwner().getId().equals(UUID.fromString(userId))) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    try {
      scoreService.packAttachmentToScore(optScore.get(), type, body.getInputStream(), makeFingering);
      return ResponseEntity.ok().build();
    } catch (java.io.IOException e) {
      log.error("IOException while packing attachment to score", e);
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
  }

  /** Content type and file extension of each generated file the download API serves. */
  private record DownloadFormat(MediaType mediaType, String extension) {
  }

  private static final java.util.Map<String, DownloadFormat> DOWNLOAD_FORMATS = java.util.Map.of(
    "pdf", new DownloadFormat(MediaType.APPLICATION_PDF, ".pdf"),
    "musicxml", new DownloadFormat(MediaType.parseMediaType("application/vnd.recordare.musicxml+xml"), ".musicxml"),
    "midi", new DownloadFormat(MediaType.parseMediaType("audio/midi"), ".mid"));

  /**
   * Downloads a file of a score. Always an attachment named after the score slug ({@code <slug>.<ext>},
   * {@code <slug>-original.<ext>} for the upload), so a browser saves it instead of opening it inline.
   * 400 on an unknown type, 404 when the score or the file does not exist.
   */
  @Override
  public ResponseEntity<org.springframework.core.io.Resource> scoreOwnerIdTypeVersionRevisionGet(String strOwner, String id, String type, Integer version, Integer revision) {
    if (!ORIGINAL_TYPE.equals(type) && !DOWNLOAD_FORMATS.containsKey(type)) {
      return ResponseEntity.badRequest().build();
    }
    try {
      User owner = userRepository.findById(UUID.fromString(strOwner)).orElseThrow(EntityNotFoundException::new);
      Optional<Score> optScore = scoreRepository.findScoreByIdAndOwnerAndVersion(UUID.fromString(id), owner, version);
      if (optScore.isEmpty()) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
      }
      Score score = optScore.get();
      if (ORIGINAL_TYPE.equals(type)) {
        return downloadOriginal(score);
      }
      if (OWNER_ONLY_WHEN_COPYRIGHTED.contains(type) && !Boolean.TRUE.equals(score.getPublicDomain())) {
        Optional<HttpStatus> refused = refuseUnlessOwnerOrAdmin(score);
        if (refused.isPresent()) {
          return ResponseEntity.status(refused.get()).build();
        }
      }
      DownloadFormat format = DOWNLOAD_FORMATS.get(type);
      return scoreService.getAttachmentFromScore(score, type)
        .map(bytes -> attachment(bytes, format.mediaType(), downloadBaseName(score) + format.extension()))
        .orElse(ResponseEntity.notFound().build());
    } catch (IOException e) {
      log.error("IOException while getting attachment from score", e);
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
  }

  /** Download file names start with the score slug (the /score/{slug} page), or its id for a score without one. */
  static String downloadBaseName(Score score) {
    String slug = score.getImmutableSlug();
    return slug != null && !slug.isBlank() ? slug : String.valueOf(score.getId());
  }

  private static ResponseEntity<org.springframework.core.io.Resource> attachment(byte[] bytes, MediaType mediaType, String filename) {
    return ResponseEntity.ok()
      .contentType(mediaType)
      .contentLength(bytes.length)
      .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
        .filename(filename, java.nio.charset.StandardCharsets.UTF_8).build().toString())
      .body(new ByteArrayResource(bytes));
  }

  /** Why the current user may not get an owner-only file: 401 when not logged in, 403 when neither owner nor admin. */
  private Optional<HttpStatus> refuseUnlessOwnerOrAdmin(Score score) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    User user;
    try {
      user = authentication == null ? null : userService.getUserFromAuthentication(authentication);
    } catch (UserNotLoggedInException e) {
      user = null;
    }
    if (user == null) {
      return Optional.of(HttpStatus.UNAUTHORIZED);
    }
    return ScoreService.isOwnerOrAdmin(score, user) ? Optional.empty() : Optional.of(HttpStatus.FORBIDDEN);
  }

  /**
   * The file uploaded at import ({@code ori.<ext>} in the score zip): only its owner and admins may fetch it.
   * 401 when not logged in, 403 for anyone else.
   */
  private ResponseEntity<org.springframework.core.io.Resource> downloadOriginal(Score score) throws IOException {
    Optional<HttpStatus> refused = refuseUnlessOwnerOrAdmin(score);
    if (refused.isPresent()) {
      return ResponseEntity.status(refused.get()).build();
    }
    return scoreService.getOriginalFromScore(score)
      .map(file -> {
        String name = file.filename();
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
        return attachment(file.content(), MediaType.parseMediaType(ScoreService.originalContentType(name)),
          downloadBaseName(score) + "-original" + ext);
      })
      .orElse(ResponseEntity.notFound().build());
  }

  @Override
  public ResponseEntity<Void> scoreIdDelete(String id) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    User user = userService.getUserFromAuthentication(authentication);

    try {
      boolean deleted = scoreService.deleteScore(UUID.fromString(id), user);
      if (deleted) {
        return ResponseEntity.noContent().build();
      } else {
        return ResponseEntity.notFound().build();
      }
    } catch (RuntimeException e) {
      if (e.getMessage().contains("Unauthorized")) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
      }
      throw e;
    }
  }

  @Override
  public ResponseEntity<List<org.pianoml.backend.model.AuthorWithScoreCount>> scoreAuthorBrowseGet(java.util.List<Integer> tracks, String fullKey, String gradeStart, String gradeEnd, String slug, Integer offset, Integer limit) {
    // Normalize pagination params
    int off = offset != null && offset >= 0 ? offset : 0;
    Integer lim = limit != null && limit > 0 ? limit : null;
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    User user;
    try {
      user = userService.getUserFromAuthentication(authentication);
    } catch (UserNotLoggedInException e) {
      user = null;
    }
    List<org.pianoml.backend.model.AuthorWithScoreCount> list = scoreService.getAuthorsWithScoreCounts(user, off, lim, tracks, fullKey, slug, gradeStart, gradeEnd);
    return ResponseEntity.ok(list);
  }

  @Override
  public ResponseEntity<List<org.pianoml.backend.model.ScoreGenreBrowseGet200ResponseInner>> scoreGenreBrowseGet(java.util.List<Integer> tracks, String fullKey, String slug, java.util.List<UUID> genre, String gradeStart, String gradeEnd, Integer offset, Integer limit) {
    // Normalize pagination params
    int off = offset != null && offset >= 0 ? offset : 0;
    Integer lim = limit != null && limit > 0 ? limit : null;
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    User user;
    try {
      user = userService.getUserFromAuthentication(authentication);
    } catch (UserNotLoggedInException e) {
      user = null;
    }
    List<org.pianoml.backend.model.ScoreGenreBrowseGet200ResponseInner> list = scoreService.getGenresWithScoreCounts(user, off, lim, tracks, genre, fullKey, slug, gradeStart, gradeEnd);
    return ResponseEntity.ok(list);
  }

  @Override
  public ResponseEntity<ScoreStatsGet200Response> scoreStatsGet() {
    ScoreStatsGet200Response stats = scoreService.getScoreStats();
    return ResponseEntity.ok(stats);
  }

  /**
   * Enregistre une lecture de score.
   * Incrémente le compteur global du score et, si un utilisateur est connecté,
   * incrémente également le compteur par utilisateur.
   *
   * @param scorePlayStatsPostRequest L'ID du score
   * @return ResponseEntity vide avec status 200 si réussi, 404 si le score n'existe pas
   */
  @Override
  public ResponseEntity<Void> scorePlayStatsPost(ScorePlayStatsPostRequest scorePlayStatsPostRequest) {
    User user = null;


    try {
      Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
      // find user
      user = userService.getUserFromAuthentication(authentication);
    } catch (Exception e) {
      // this is acceptable, user can be null but exception shall be narrowed ...
    }
    try {
      // find score
      UUID scoreId = UUID.fromString(scorePlayStatsPostRequest.getId());
      // Incrémenter les compteurs
      scoreService.incrementPlayCount(scoreId, user);
    } catch (Exception e) {
      // this is acceptable, user can be null but exception shall be narrowed ...
    }
    return ResponseEntity.ok().build();
  }
}
