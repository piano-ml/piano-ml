package org.pianoml.backend.coach.oauth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Random values and their stored hashes for the coach OAuth server (issue #414): request ids, codes, tokens. */
public final class OAuthSecrets {

  private static final SecureRandom RANDOM = new SecureRandom();

  private OAuthSecrets() {
  }

  /** 32 random bytes, base64url without padding (43 characters). */
  public static String random() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  /** Hex SHA-256 of the value's UTF-8 bytes: what is stored and looked up, never the value itself. */
  public static String hash(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
