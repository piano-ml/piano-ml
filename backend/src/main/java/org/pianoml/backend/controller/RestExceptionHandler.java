package org.pianoml.backend.controller;

import org.pianoml.backend.exception.InvalidPasswordResetTokenException;
import org.pianoml.backend.exception.UserAlreadyExistsException;
import org.pianoml.backend.exception.UserNotLoggedInException;
import org.pianoml.backend.service.ErrorReportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.Locale;
import java.util.Map;

@ControllerAdvice
public class RestExceptionHandler extends ResponseEntityExceptionHandler {

  private final ErrorReportService errorReportService;

  public RestExceptionHandler(ErrorReportService errorReportService) {
    this.errorReportService = errorReportService;
  }

  /**
   * Spring MVC's own exceptions: the few answered with a 5xx (unwritable response, async timeout...) go to the
   * admin error reports (issue #408); the 4xx ones are expected and are not recorded.
   */
  @Override
  protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                           HttpStatusCode statusCode, WebRequest request) {
    if (statusCode.is5xxServerError() && request instanceof ServletWebRequest servletRequest) {
      errorReportService.recordBackend(ex, servletRequest.getRequest(), statusCode.value());
    }
    return super.handleExceptionInternal(ex, body, headers, statusCode, request);
  }

  /** 409 with the field already taken ({@code email} or {@code name}), for the sign-up form to show it. */
  @ExceptionHandler({UserAlreadyExistsException.class})
  public ResponseEntity<Object> handleUserAlreadyExists(UserAlreadyExistsException ex, WebRequest request) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
      .contentType(MediaType.APPLICATION_JSON)
      .body(Map.of("field", ex.getField().name().toLowerCase(Locale.ROOT), "message", ex.getMessage()));
  }


  /** 400 {"error": "invalid_token"}: the reset page then offers to ask for a new link. */
  @ExceptionHandler({InvalidPasswordResetTokenException.class})
  public ResponseEntity<Object> handleInvalidPasswordResetToken(InvalidPasswordResetTokenException ex) {
    return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(Map.of("error", ex.getMessage()));
  }

  @ExceptionHandler({UserNotLoggedInException.class})
  public ResponseEntity<Object> handleUserNotLoggedIn(
    Exception ex, WebRequest request) {
    return new ResponseEntity<Object>(
      ex.getMessage(), new HttpHeaders(), HttpStatus.UNAUTHORIZED);
  }


}
