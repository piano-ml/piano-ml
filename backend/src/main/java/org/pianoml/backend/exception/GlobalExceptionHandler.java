package org.pianoml.backend.exception;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.model.ErrorApiInfoError;
import org.pianoml.backend.service.ErrorReportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;


@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

  private final ErrorReportService errorReportService;

  public GlobalExceptionHandler(ErrorReportService errorReportService) {
    this.errorReportService = errorReportService;
  }

  @ExceptionHandler(BadCredentialsException.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleBadCredentialsException(Exception ex) {
    log.warn("{}", ex.getClass().getName());
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = makeFromException(ex);
    errorApiInfo.getError().setStacktrace(null);
    return new ResponseEntity<>(errorApiInfo, HttpStatus.FORBIDDEN);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleAll(Exception ex, HttpServletRequest request) {
    log.error("An unexpected error occurred: {}", ex);
    // Saved for the admin error reports (issue #408); never throws
    errorReportService.recordBackend(ex, request, HttpStatus.INTERNAL_SERVER_ERROR.value());
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = makeFromException(ex);
    return new ResponseEntity<>(errorApiInfo, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @ExceptionHandler(MusicBrainzException.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleBrainz(Exception ex) {
    log.error("An unexpected error occurred: {}", ex);
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = makeFromException(ex);
    return new ResponseEntity<>(errorApiInfo, HttpStatus.NOT_FOUND);
  }

  @ExceptionHandler(EntityAlreadyExistsException.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleEntityExistsException(Exception ex) {
    log.warn("{}", ex.getClass().getName());
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = makeFromException(ex);
    errorApiInfo.getError().setStacktrace(null);
    return new ResponseEntity<>(errorApiInfo, HttpStatus.CONFLICT);
  }

  /**
   * 404 for a missing entity. Needed explicitly: the catch-all {@link #handleAll} handler takes precedence over
   * the exception's {@code @ResponseStatus(NOT_FOUND)}, which turned "workload not found" into a 500. JPA's own
   * EntityNotFoundException (thrown by ScoreController for an unknown user) is a 404 too.
   */
  @ExceptionHandler({EntityNotFoundException.class, jakarta.persistence.EntityNotFoundException.class})
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleEntityNotFoundException(Exception ex) {
    log.debug("{}: {}", ex.getClass().getSimpleName(), ex.getMessage());
    return new ResponseEntity<>(makeFromException(ex), HttpStatus.NOT_FOUND);
  }

  /**
   * 400 for invalid input: a malformed UUID in the path, a score without title or author... These used to fall
   * into {@link #handleAll} and answer 500.
   */
  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleIllegalArgumentException(Exception ex) {
    log.debug("Bad request: {}", ex.getMessage());
    return new ResponseEntity<>(makeFromException(ex), HttpStatus.BAD_REQUEST);
  }

  /**
   * 400 for a parameter outside the bounds the API declares (minimum/maximum: Spring validates them before the
   * controller runs). Without it, {@link #handleAll} answered 500 and recorded an error report.
   */
  @ExceptionHandler({org.springframework.web.method.annotation.HandlerMethodValidationException.class,
    jakarta.validation.ConstraintViolationException.class})
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleMethodValidation(Exception ex) {
    log.debug("Invalid parameter: {}", ex.getMessage());
    return new ResponseEntity<>(makeFromException(ex), HttpStatus.BAD_REQUEST);
  }

  private org.pianoml.backend.model.ErrorApiInfo makeFromException(Exception ex) {
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = new org.pianoml.backend.model.ErrorApiInfo();
    ErrorApiInfoError errorApiInfoError = new ErrorApiInfoError();
    errorApiInfoError.setMessage(ex.getMessage());
    errorApiInfoError.setName(ex.getClass().getName());
    // No stack trace in responses: it exposed internal classes, files and line numbers to any client
    // (500 and MusicBrainz 404 answers). Handlers log the exception server-side instead.
    errorApiInfo.setError(errorApiInfoError);
    return errorApiInfo;
  }
}
