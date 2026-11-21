package org.pianoml.backend.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import lombok.Getter;
import org.pianoml.backend.entity.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Date;

@Component
public class JwtTokenProvider {

  @Value("${jwt.secret:'supersecret'}")
  private String jwtSecret;

  /**
   * How long a login lasts (the token and its cookie): 30 days, as PianoML is a low-risk entertainment site where
   * being asked to log in again costs more than a stolen session. {@code jwt.expiration} takes 30d, 12h, PT1H...
   */
  @Value("${jwt.expiration:30d}")
  @Getter
  private Duration jwtExpiration = Duration.ofDays(30);

  public String generateToken(User user) {
    Date now = new Date();
    Date expiryDate = new Date(now.getTime() + jwtExpiration.toMillis());

    return JWT.create()
      .withSubject(user.getId().toString())
      .withIssuedAt(now)
      .withExpiresAt(expiryDate)
      .sign(Algorithm.HMAC512(jwtSecret));
  }

  public String getUserIdFromJWT(String token) {
    DecodedJWT jwt = JWT.require(Algorithm.HMAC512(jwtSecret))
      .build()
      .verify(token);
    return jwt.getSubject();
  }

  public boolean validateToken(String authToken) {
    try {
      JWT.require(Algorithm.HMAC512(jwtSecret)).build().verify(authToken);
      return true;
    } catch (Exception ex) {
      // Invalid token
    }
    return false;
  }
}
