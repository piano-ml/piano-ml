package org.pianoml.backend.mail;

/** Sends an email. Implemented by {@link ResendMailSender}; replaced by a mock in tests. */
public interface MailSender {

  /**
   * Sends one email.
   * @throws MailException when it could not be sent
   */
  void send(String to, String subject, String html, String text);

  class MailException extends RuntimeException {
    public MailException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
