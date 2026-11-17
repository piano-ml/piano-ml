package org.pianoml.backend.coach.oauth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Where PianoML says it is, for OAuth discovery (coach, issue #414; docs/coach-oauth-design.md 2.1).
 *
 * <p>{@code resource} must equal, character for character, the MCP URL users type into their client: Claude
 * compares the two. No trailing slash, on either value.
 *
 * <p>{@code enabled} stays false until the authorization and token endpoints exist (phases O3 and O4): until
 * then no document is served and the 401 challenge points nowhere, so that no client starts a flow that cannot
 * finish. Personal access tokens work either way.
 */
@Component
public class CoachOAuthSettings {

  /** The scopes, in the order they are advertised. Same set as {@code CoachGrantService.SCOPES}. */
  public static final List<String> SCOPES = List.of("practice:read", "scores:read", "player:control");

  private final boolean enabled;
  private final String issuer;
  private final String resource;

  public CoachOAuthSettings(@Value("${coach.oauth.enabled:false}") boolean enabled,
                            @Value("${coach.oauth.issuer:https://api.pianoml.org}") String issuer,
                            @Value("${coach.oauth.resource:}") String resource) {
    this.enabled = enabled;
    this.issuer = stripSlash(issuer);
    this.resource = resource == null || resource.isBlank() ? this.issuer + "/mcp" : stripSlash(resource);
  }

  private static String stripSlash(String value) {
    String v = value.strip();
    return v.endsWith("/") ? v.substring(0, v.length() - 1) : v;
  }

  public boolean enabled() {
    return enabled;
  }

  public String issuer() {
    return issuer;
  }

  public String resource() {
    return resource;
  }

  /** The protected resource metadata URL for the resource: its path appended to the well-known prefix (RFC 9728 3.1). */
  public String resourceMetadataUrl() {
    java.net.URI uri = java.net.URI.create(resource);
    String path = uri.getRawPath() == null ? "" : uri.getRawPath();
    return uri.getScheme() + "://" + uri.getRawAuthority() + "/.well-known/oauth-protected-resource" + path;
  }
}
