package org.pianoml.backend.coach.oauth;

/** A client metadata document that cannot be used (coach, issue #414): the message says why, for logs and the error page. */
public class ClientMetadataException extends Exception {

  public ClientMetadataException(String message) {
    super(message);
  }
}
