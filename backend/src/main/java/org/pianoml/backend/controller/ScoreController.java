package org.pianoml.backend.controller;

import org.pianoml.backend.api.ScoreApi;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.service.ScoreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class ScoreController implements ScoreApi {

    @Autowired
    private ScoreService scoreService;

    @Autowired
    private UserRepository userRepository;

    @Override
    public ResponseEntity<ScoreApiInfo> scoreIdGet(String id) {
        return scoreService.getScore(UUID.fromString(id))
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @Override
    public ResponseEntity<ScoreApiInfo> scoreIdPut(String id, ScoreApiInfo scoreApiInfo) {
        return scoreService.updateScore(UUID.fromString(id), scoreApiInfo)
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @Override
    public ResponseEntity<ScoreApiInfo> scorePost(ScoreApiInfo scoreApiInfo) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String userEmail = authentication.getName();
        String userId = userRepository.findByEmail(userEmail).get().getId().toString();

        ScoreApiInfo createdScore = scoreService.createScore(scoreApiInfo, userId);
        return new ResponseEntity<>(createdScore, HttpStatus.CREATED);
    }

    @Override
    public ResponseEntity<List<ScoreApiInfo>> scoreSearchGet(String keyword, String genreId, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit) {
        List<ScoreApiInfo> scores = scoreService.searchScores(keyword, genreId, gradeStart, gradeEnd, offset, limit);
        return ResponseEntity.ok(scores);
    }

    @Override
    public ResponseEntity<Void> scoreIdTypePost(String id, String type, org.springframework.core.io.Resource body) {
        return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
    }

    @Override
    public ResponseEntity<org.springframework.core.io.Resource> scoreIdTypeGet(String id, String type) {
        return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
    }
}
