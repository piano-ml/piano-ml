package org.pianoml.backend.controller;

import jakarta.persistence.EntityNotFoundException;
import org.pianoml.backend.api.ScoreApi;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.exception.EntityAlreadyExistsException;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.ScoreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
public class ScoreController implements ScoreApi {

  @Autowired
  private ScoreService scoreService;

  @Autowired
  private UserRepository userRepository;

  @Autowired
  private AccountService userService;

  @Autowired
  private ScoreRepository scoreRepository;

  @Autowired
  private JwtTokenProvider tokenProvider;

  @Override
  public ResponseEntity<ScoreApiInfo> scoreIdGet(String id) {
    return scoreService.getScore(UUID.fromString(id))
      .map(ResponseEntity::ok)
      .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
  }

  @Override
  public ResponseEntity<ScoreApiInfo> scoreIdPut(String id, ScoreApiInfo scoreApiInfo) {

    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    String userid = authentication.getName();
    User user = userRepository.findById(UUID.fromString(userid)).orElseThrow(EntityNotFoundException::new);

    ScoreApiInfo score = scoreService.getScore(UUID.fromString(id)).get();
    if (!score.getOwnerId().equals(user.getId().toString())) {
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
    try {
      if (scoreApiInfo.getHasFiles()==null) {
        scoreApiInfo.setHasFiles(false);
      }
      ScoreApiInfo createdScore = scoreService.createScore(scoreApiInfo, user);
      return new ResponseEntity<>(createdScore, HttpStatus.CREATED);
    } catch (DataIntegrityViolationException e) {
      throw new EntityAlreadyExistsException("You have already created this score, please consider edit it in account/scores page.");
    }
  }

  @Override
  public ResponseEntity<List<ScoreApiInfo>> scoreSearchGet(String keyword, String ownerId,  String genreId, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit) {
    List<ScoreApiInfo> scores = scoreService.searchScores(keyword, ownerId, genreId, gradeStart, gradeEnd, offset, limit);
    return ResponseEntity.ok(scores);
  }


  @Override
  public ResponseEntity<Void> scoreMbidTypeVersionRevisionPost(String mbid, String type, Integer version, Integer revision, org.springframework.core.io.Resource body, Integer track1, Integer track2) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    String id = authentication.getName();
    User user = userRepository.findById(UUID.fromString(id)).orElseThrow(EntityNotFoundException::new);
    Optional<Score> optScore = scoreRepository.findScoreByMbidAndOwnerAndVersion(UUID.fromString(mbid), user, version);
    if (optScore.isEmpty()) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
    if (!optScore.get().getOwner().getId().equals(UUID.fromString(id))) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    try {
      scoreService.packAttachmentToScore(optScore.get(), type, body.getInputStream());
      return ResponseEntity.ok().build();
    } catch (java.io.IOException e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
  }

  @Override
  public ResponseEntity<org.springframework.core.io.Resource> scoreOwnerMbidTypeVersionRevisionGet(String strOwner, String mbid, String type, Integer version, Integer revision) {
    try {
      User owner = userRepository.findById(UUID.fromString(strOwner)).orElseThrow(EntityNotFoundException::new);
      Optional<Score> optScore = scoreRepository.findScoreByMbidAndOwnerAndVersion(UUID.fromString(mbid), owner, version);
      if (optScore.isEmpty()) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
      }
      return scoreService.getAttachmentFromScore(optScore.get(),type)
        .map(bytes -> ResponseEntity.ok()
          .contentType(MediaType.APPLICATION_OCTET_STREAM)
          .body((org.springframework.core.io.Resource) new ByteArrayResource(bytes)))
        .orElse(ResponseEntity.notFound().build()); // TODO throw a specific exception
    } catch (IOException e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
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
}
