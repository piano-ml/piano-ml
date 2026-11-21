package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.PasswordResetToken;
import org.pianoml.backend.entity.SystemUsers;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.exception.InvalidPasswordResetTokenException;
import org.pianoml.backend.mail.MailSender;
import org.pianoml.backend.mail.PasswordResetMail;
import org.pianoml.backend.repository.PasswordResetTokenRepository;
import org.pianoml.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/**
 * Password reset by email (#442):
 * <ol>
 *   <li>{@link #requestReset}: when an account uses the email, emails it a link with a random single-use token,
 *   valid {@code account.password-reset.ttl} (1 week); only the token's SHA-256 is stored. Whether an account
 *   exists is never told. At most {@code account.password-reset.max-emails-per-day} (3) emails per account in any
 *   24 hours; a new link ends the previous ones.</li>
 *   <li>{@link #resetPassword}: the token sets a new password, then no longer works (nor any other link of the
 *   account). It also proves the email is the user's, so the account becomes verified, and revokes every token
 *   of external tools (coach, #414), which must not keep working with the old password.</li>
 * </ol>
 * Links are ended by setting their expiry to now, not deleted: the rows of the last 24 hours count the emails
 * sent. Rows expired and older than a day are deleted at each request.
 * Sessions already open stay open: a JWT cannot be revoked, and expires on its own.
 */
@Slf4j
@Service
public class PasswordResetService {

  private static final SecureRandom RANDOM = new SecureRandom();
  private static final Duration DAY = Duration.ofDays(1);

  private final UserRepository users;
  private final PasswordResetTokenRepository tokens;
  private final PasswordEncoder passwordEncoder;
  private final SupportedLocales supportedLocales;
  private final PasswordResetMail mail;
  private final MailSender mailSender;
  private final CoachGrantService coachGrants;
  private final Duration ttl;
  private final int maxEmailsPerDay;
  private final String linkBase;
  private Clock clock = Clock.systemUTC();

  @Autowired
  public PasswordResetService(UserRepository users, PasswordResetTokenRepository tokens, PasswordEncoder passwordEncoder,
                              SupportedLocales supportedLocales, PasswordResetMail mail, MailSender mailSender,
                              CoachGrantService coachGrants,
                              @Value("${account.password-reset.ttl:7d}") Duration ttl,
                              @Value("${account.password-reset.max-emails-per-day:3}") int maxEmailsPerDay,
                              @Value("${account.password-reset.link-base:https://pianoml.org}") String linkBase) {
    this.users = users;
    this.tokens = tokens;
    this.passwordEncoder = passwordEncoder;
    this.supportedLocales = supportedLocales;
    this.mail = mail;
    this.mailSender = mailSender;
    this.coachGrants = coachGrants;
    this.ttl = ttl;
    this.maxEmailsPerDay = maxEmailsPerDay;
    this.linkBase = linkBase.replaceAll("/+$", "");
  }

  /** For tests. */
  void setClock(Clock clock) {
    this.clock = clock;
  }

  /**
   * Emails a reset link when an account uses this email, in the account's language (else the one the request
   * comes from). Does nothing otherwise. A failure to send the email is a {@link MailSender.MailException}, and
   * the link is not kept.
   */
  @Transactional
  public void requestReset(String email, String requestedLocale, String acceptLanguage) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    tokens.deleteExpired(now, now.minus(DAY));
    Optional<User> found = users.findByEmail(email).filter(u -> !SystemUsers.JUNK_ID.equals(u.getId()));
    if (found.isEmpty()) {
      log.info("Password reset asked for an email no account uses");
      return;
    }
    User user = found.get();
    if (tokens.countByUserIdAndCreatedAtAfter(user.getId(), now.minus(DAY)) >= maxEmailsPerDay) {
      log.info("Password reset for account {}: {} emails sent in 24 hours already, no new one", user.getId(), maxEmailsPerDay);
      return;
    }
    tokens.expireAllOfUser(user.getId(), now);

    String token = newToken();
    PasswordResetToken row = new PasswordResetToken();
    row.setId(UUID.randomUUID());
    row.setUserId(user.getId());
    row.setTokenHash(hash(token));
    row.setCreatedAt(now);
    row.setExpiresAt(now.plus(ttl));
    tokens.save(row);

    String locale = user.getLocale() != null
      ? supportedLocales.match(user.getLocale()).orElse(supportedLocales.fallback())
      : supportedLocales.resolve(requestedLocale, acceptLanguage);
    PasswordResetMail.Message message = mail.render(locale, user.getName(), link(locale, token));
    mailSender.send(user.getEmail(), message.subject(), message.html(), message.text());
    log.info("Password reset link sent to account {}", user.getId());
  }

  /**
   * Sets a new password with the token of a link.
   * @throws InvalidPasswordResetTokenException when the token is unknown, already used or expired
   */
  @Transactional
  public void resetPassword(String token, String newPassword) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    PasswordResetToken row = Optional.ofNullable(token).filter(t -> !t.isBlank())
      .flatMap(t -> tokens.findByTokenHash(hash(t)))
      .filter(t -> t.getExpiresAt().isAfter(now))
      .orElseThrow(InvalidPasswordResetTokenException::new);
    User user = users.findById(row.getUserId()).orElseThrow(InvalidPasswordResetTokenException::new);
    user.setPassword(passwordEncoder.encode(newPassword));
    user.setVerified(true);
    users.save(user);
    tokens.expireAllOfUser(user.getId(), now);
    int revoked = coachGrants.revokeAll(user.getId());
    log.info("Password reset for account {} ({} coach grant(s) revoked)", user.getId(), revoked);
  }

  /** The page of the link, in the language's URL prefix: https://pianoml.org/fr/account/reset-password?token=... */
  String link(String locale, String token) {
    String prefix = supportedLocales.pathPrefix(locale);
    return linkBase + (prefix.isEmpty() ? "" : "/" + prefix) + "/account/reset-password?token="
      + URLEncoder.encode(token, StandardCharsets.UTF_8);
  }

  /** 32 random bytes, URL-safe Base64 (43 characters). */
  static String newToken() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  static String hash(String token) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
