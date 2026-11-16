package org.pianoml.backend.coach;

/**
 * A tool refusal that goes back to the model as {@code { ok: false, code, message }} (coach, issue #414). The
 * message is one English sentence telling the model what to do next; it must not contain internal details.
 */
public class CoachToolException extends RuntimeException {

  public static final String INVALID_ARGUMENT = "INVALID_ARGUMENT";
  public static final String FORBIDDEN_SCOPE = "FORBIDDEN_SCOPE";
  public static final String RATE_LIMITED = "RATE_LIMITED";
  public static final String INTERNAL = "INTERNAL";

  private final String code;

  public CoachToolException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String code() {
    return code;
  }

  public static CoachToolException invalidArgument(String message) {
    return new CoachToolException(INVALID_ARGUMENT, message);
  }
}
