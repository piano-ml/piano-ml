package org.pianoml.backend.service;

/** Test access to package-private helpers of {@link PasswordResetService}. */
public final class PasswordResetServiceAccess {
  private PasswordResetServiceAccess() {
  }

  public static String hash(String token) {
    return PasswordResetService.hash(token);
  }
}
