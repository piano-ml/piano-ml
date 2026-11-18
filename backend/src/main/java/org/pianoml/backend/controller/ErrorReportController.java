package org.pianoml.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.pianoml.backend.api.ErrorReportApi;
import org.pianoml.backend.model.ErrorReportCreate;
import org.pianoml.backend.service.ErrorReportRateLimiter;
import org.pianoml.backend.service.ErrorReportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Errors pushed by the browser (issue #408). Open to anonymous users and exempt from CSRF
 * ({@link org.pianoml.backend.config.SecurityConfig}); rate-limited per IP.
 */
@RestController
public class ErrorReportController implements ErrorReportApi {

  private final ErrorReportService errorReportService;
  private final ErrorReportRateLimiter rateLimiter;
  private final HttpServletRequest request;

  public ErrorReportController(ErrorReportService errorReportService, ErrorReportRateLimiter rateLimiter,
                               HttpServletRequest request) {
    this.errorReportService = errorReportService;
    this.rateLimiter = rateLimiter;
    this.request = request;
  }

  @Override
  public ResponseEntity<Void> errorReportPost(ErrorReportCreate errorReportCreate) {
    if (!rateLimiter.tryAcquire(request)) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "60").build();
    }
    errorReportService.ingest(errorReportCreate, request);
    return ResponseEntity.accepted().build();
  }
}
