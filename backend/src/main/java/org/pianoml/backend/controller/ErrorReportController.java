package org.pianoml.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.pianoml.backend.api.ErrorReportApi;
import org.pianoml.backend.model.ErrorReportCreate;
import org.pianoml.backend.service.ErrorReportRateLimiter;
import org.pianoml.backend.service.ErrorReportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Errors pushed by the browser (issue #408). Open to anonymous users and exempt from CSRF
 * ({@link org.pianoml.backend.config.SecurityConfig}); rate-limited per IP.
 * <p>
 * The request is read per call, not injected: the jobs run the application without a web context
 * (application-job.properties), where no request bean exists and the startup would fail.
 */
@RestController
public class ErrorReportController implements ErrorReportApi {

  private final ErrorReportService errorReportService;
  private final ErrorReportRateLimiter rateLimiter;

  public ErrorReportController(ErrorReportService errorReportService, ErrorReportRateLimiter rateLimiter) {
    this.errorReportService = errorReportService;
    this.rateLimiter = rateLimiter;
  }

  @Override
  public ResponseEntity<Void> errorReportPost(ErrorReportCreate errorReportCreate) {
    HttpServletRequest request = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
    if (!rateLimiter.tryAcquire(request)) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "60").build();
    }
    errorReportService.ingest(errorReportCreate, request);
    return ResponseEntity.accepted().build();
  }
}
