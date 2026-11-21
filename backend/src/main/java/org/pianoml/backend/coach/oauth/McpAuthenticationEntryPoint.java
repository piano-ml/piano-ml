package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import java.io.IOException;

/**
 * The 401 of the /mcp chain, with the challenge MCP clients start sign-in from (coach, issue #414;
 * docs/coach-oauth-design.md 2.1; RFC 6750 3, RFC 9728 5.1).
 *
 * <p>{@code Bearer realm="PianoML"}, plus {@code error="invalid_token"} when a bearer token was sent, plus, while
 * OAuth is on, {@code resource_metadata} and the scopes to ask for. Claude only starts sign-in on a 401.
 */
public class McpAuthenticationEntryPoint implements AuthenticationEntryPoint {

  private final CoachOAuthSettings settings;

  public McpAuthenticationEntryPoint(CoachOAuthSettings settings) {
    this.settings = settings;
  }

  @Override
  public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException e)
    throws IOException {
    response.setHeader("WWW-Authenticate", challenge(request.getHeader("Authorization")));
    response.setHeader("Cache-Control", "no-store");
    response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
  }

  String challenge(String authorization) {
    StringBuilder value = new StringBuilder("Bearer realm=\"PianoML\"");
    if (authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
      value.append(", error=\"invalid_token\"");
    }
    if (settings.enabled()) {
      value.append(", resource_metadata=\"").append(settings.resourceMetadataUrl()).append('"');
      value.append(", scope=\"").append(String.join(" ", CoachOAuthSettings.SCOPES)).append('"');
    }
    return value.toString();
  }
}
