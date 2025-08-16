package org.pianoml.backend.exception;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.model.ErrorApiInfoError;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.security.authentication.BadCredentialsException;

import java.util.Arrays;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(BadCredentialsException.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleBadCredentialsException(Exception ex) {
    log.warn("{}", ex.getClass().getName());
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = makeFromException(ex);
    errorApiInfo.getError().setStacktrace(null);
    return new ResponseEntity<>(errorApiInfo, HttpStatus.FORBIDDEN);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleAll(Exception ex) {
    log.error("An unexpected error occurred: {}", ex);
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = makeFromException(ex);
    return new ResponseEntity<>(errorApiInfo, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @ExceptionHandler(MusicBrainzException.class)
  public ResponseEntity<org.pianoml.backend.model.ErrorApiInfo> handleBrainz(Exception ex) {
    log.error("An unexpected error occurred: {}", ex);
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = makeFromException(ex);
    return new ResponseEntity<>(errorApiInfo, HttpStatus.NOT_FOUND);
  }

  private org.pianoml.backend.model.ErrorApiInfo makeFromException(Exception ex) {
    org.pianoml.backend.model.ErrorApiInfo errorApiInfo = new org.pianoml.backend.model.ErrorApiInfo();
    ErrorApiInfoError errorApiInfoError = new ErrorApiInfoError();
    errorApiInfoError.setMessage(ex.getMessage());
    errorApiInfoError.setName(ex.getClass().getName());
    errorApiInfoError.setStacktrace(Arrays.stream(ex.getStackTrace()).map(StackTraceElement::toString).collect(Collectors.toList()));
    errorApiInfo.setError(errorApiInfoError);
    return errorApiInfo;
  }
}
