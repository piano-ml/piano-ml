package org.pianoml.backend.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import org.pianoml.backend.entity.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Date;

@Component
public class JwtTokenProvider {

    @Value("${jwt.secret:'supersecret'}")
    private String jwtSecret;

    @Value("${jwt.expiration-ms:1000}")
    private int jwtExpirationInMs;

    public String generateToken(User user) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationInMs);

        return JWT.create()
                .withSubject(user.getClass().toString())
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
