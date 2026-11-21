package org.pianoml.backend.exception;

/** A password reset token unknown, already used or expired: answered 400 {"error": "invalid_token"}. */
public class InvalidPasswordResetTokenException extends RuntimeException {
  public InvalidPasswordResetTokenException() {
    super("invalid_token");
  }
}
