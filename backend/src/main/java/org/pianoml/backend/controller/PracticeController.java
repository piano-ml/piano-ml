package org.pianoml.backend.controller;

import org.pianoml.backend.api.PracticeApi;
import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.PracticeSessionApiInfo;
import org.pianoml.backend.model.PracticeSummary;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.PracticeSessionService;
import org.pianoml.backend.service.PracticeSummaryService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Practice sessions and progress of the logged-in user (issue #399). Every operation is private to its user:
 * GET requests are open in {@link org.pianoml.backend.config.SecurityConfig}, so each one resolves the user
 * itself and answers 401 without one.
 */
@RestController
public class PracticeController implements PracticeApi {

  private final PracticeSessionService practiceSessionService;
  private final PracticeSummaryService practiceSummaryService;
  private final AccountService accountService;

  public PracticeController(PracticeSessionService practiceSessionService,
                            PracticeSummaryService practiceSummaryService, AccountService accountService) {
    this.practiceSessionService = practiceSessionService;
    this.practiceSummaryService = practiceSummaryService;
    this.accountService = accountService;
  }

  @Override
  public ResponseEntity<PracticeSessionApiInfo> practiceSessionPut(UUID id, PracticeSessionApiInfo body) {
    User user = currentUser();
    Optional<PracticeSession> existing = practiceSessionService.find(id);
    if (existing.isPresent() && !existing.get().getUserId().equals(user.getId())) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    Optional<PracticeSession> saved;
    try {
      saved = practiceSessionService.upsert(id, body, user);
    } catch (DataIntegrityViolationException e) {
      // Two writes of a new session raced (checkpoint and page unload): the other one created the row.
      if (practiceSessionService.find(id).filter(s -> s.getUserId().equals(user.getId())).isEmpty()) {
        throw e;
      }
      saved = practiceSessionService.upsert(id, body, user);
    }
    // Nothing assessed (neither accuracy nor flow): not stored
    return saved
      .map(s -> ResponseEntity.ok(practiceSessionService.toApiInfo(s, practiceSessionService.slugOf(s))))
      .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @Override
  public ResponseEntity<List<PracticeSessionApiInfo>> practiceSessionsGet(Integer limit, String kind, UUID scoreId) {
    User user = currentUser();
    List<PracticeSessionApiInfo> sessions = practiceSessionService.recent(user, limit == null ? 10 : limit, kind, scoreId)
      .stream()
      .map(s -> practiceSessionService.toApiInfo(s, practiceSessionService.slugOf(s)))
      .toList();
    return ResponseEntity.ok(sessions);
  }

  @Override
  public ResponseEntity<Void> practiceSessionsDelete() {
    practiceSessionService.deleteHistory(currentUser());
    return ResponseEntity.noContent().build();
  }

  @Override
  public ResponseEntity<PracticeSummary> practiceSummaryGet(String timeZone) {
    return ResponseEntity.ok(practiceSummaryService.summary(currentUser(), timeZone));
  }

  /** @throws org.pianoml.backend.exception.UserNotLoggedInException (401) for an anonymous request */
  private User currentUser() {
    return accountService.getUserFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
  }
}
