package org.pianoml.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class EntityAlreadyExistsException extends RuntimeException {
  public EntityAlreadyExistsException(String message) {
    super(message);
  }
}
