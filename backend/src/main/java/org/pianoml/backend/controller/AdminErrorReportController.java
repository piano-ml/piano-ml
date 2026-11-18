package org.pianoml.backend.controller;

import org.pianoml.backend.api.AdminApi;
import org.pianoml.backend.model.ErrorReportDeleted;
import org.pianoml.backend.model.ErrorReportDetail;
import org.pianoml.backend.model.ErrorReportLevel;
import org.pianoml.backend.model.ErrorReportPage;
import org.pianoml.backend.model.ErrorReportSource;
import org.pianoml.backend.service.ErrorReportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.function.Supplier;

import static org.pianoml.backend.security.SecurityUtils.isAdmin;

/**
 * Admin browsing of the error reports (issue #408). {@code /admin/**} already requires the ADMIN role in
 * {@link org.pianoml.backend.config.SecurityConfig}; every method checks it again, so a change to the
 * security rules (such as the open GET rule) cannot expose the reports.
 */
@RestController
public class AdminErrorReportController implements AdminApi {

  private final ErrorReportService errorReportService;

  public AdminErrorReportController(ErrorReportService errorReportService) {
    this.errorReportService = errorReportService;
  }

  @Override
  public ResponseEntity<ErrorReportPage> adminErrorReportsGet(ErrorReportSource source, ErrorReportLevel level,
                                                              OffsetDateTime from, OffsetDateTime to, String q,
                                                              String fingerprint, Boolean grouped,
                                                              Integer offset, Integer limit) {
    return asAdmin(() -> ResponseEntity.ok(errorReportService.search(source, level, from, to, q, fingerprint,
      Boolean.TRUE.equals(grouped), offset == null ? 0 : offset, limit == null ? 50 : limit)));
  }

  @Override
  public ResponseEntity<ErrorReportDetail> adminErrorReportGet(UUID id) {
    return asAdmin(() -> ResponseEntity.ok(errorReportService.detail(id)));
  }

  @Override
  public ResponseEntity<Void> adminErrorReportDelete(UUID id) {
    return asAdmin(() -> {
      errorReportService.delete(id);
      return ResponseEntity.noContent().build();
    });
  }

  @Override
  public ResponseEntity<ErrorReportDeleted> adminErrorReportsDelete(String fingerprint) {
    return asAdmin(() -> ResponseEntity.ok(new ErrorReportDeleted(errorReportService.deleteFingerprint(fingerprint))));
  }

  /** 401 without a user, 403 for a user who is not an admin. */
  private static <T> ResponseEntity<T> asAdmin(Supplier<ResponseEntity<T>> action) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || authentication instanceof AnonymousAuthenticationToken || !authentication.isAuthenticated()) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }
    if (!isAdmin(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    return action.get();
  }
}
