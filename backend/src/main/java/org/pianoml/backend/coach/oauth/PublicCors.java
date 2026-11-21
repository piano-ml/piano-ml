package org.pianoml.backend.coach.oauth;

import org.springframework.web.cors.CorsConfiguration;

import java.util.List;

/**
 * CORS for the endpoints MCP clients call, wherever they run, a web page included (coach, issue #414;
 * docs/coach-oauth-design.md 2.6): any origin, never credentials.
 *
 * <p>Safe because these endpoints read no cookie: they authenticate with a bearer token in the Authorization
 * header, or not at all, so a page on another site has no ambient credential to borrow.
 */
public final class PublicCors {

  private PublicCors() {
  }

  public static CorsConfiguration configuration() {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(List.of("*"));
    configuration.setAllowCredentials(false);
    configuration.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
    configuration.setAllowedHeaders(List.of(
      "Authorization", "Content-Type", "Accept", "Mcp-Protocol-Version", "Mcp-Session-Id", "Last-Event-ID"));
    configuration.setExposedHeaders(List.of("WWW-Authenticate", "Mcp-Session-Id"));
    configuration.setMaxAge(3600L);
    return configuration;
  }
}
