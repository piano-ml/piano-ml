package org.pianoml.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Sign-up with an email or a name another account already has. {@link #getField()} tells which one, so the form can
 * show the message under the right field.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class UserAlreadyExistsException extends RuntimeException {

  /** The field already taken. */
  public enum Field { EMAIL, NAME }

  private final Field field;

  public UserAlreadyExistsException(Field field, String message) {
    super(message);
    this.field = field;
  }

  public Field getField() {
    return field;
  }
}
