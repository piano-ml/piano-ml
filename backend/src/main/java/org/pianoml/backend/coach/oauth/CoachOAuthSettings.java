package org.pianoml.backend.coach.oauth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Where PianoML says it is, for OAuth discovery (coach, issue #414; docs/coach-oauth-design.md 2.1).
 *
 * <p>{@code resource} must equal, character for character, the MCP URL users type into their client: Claude
 * compares the two. No trailing slash, on either value.
 *
 * <p>{@code enabled} (true by default) switches OAuth off: no discovery document, no OAuth endpoint, and a 401
 * challenge without resource_metadata, so that no client starts a flow. Personal access tokens work either way.
 */
@Component
public class CoachOAuthSettings {

  /** The scopes, in the order they are advertised. Same set as {@code CoachGrantService.SCOPES}. */
  public static final List<String> SCOPES = List.of("practice:read", "scores:read", "player:control");

  private final boolean enabled;
  private final String issuer;
  private final String resource;
  private final String consentUrl;

  @Autowired
  public CoachOAuthSettings(@Value("${coach.oauth.enabled:true}") boolean enabled,
                            @Value("${coach.oauth.issuer:https://api.pianoml.org}") String issuer,
                            @Value("${coach.oauth.resource:}") String resource,
                            @Value("${coach.oauth.consent-url:https://pianoml.org/coach/authorize}") String consentUrl) {
    this.enabled = enabled;
    this.issuer = stripSlash(issuer);
    this.resource = resource == null || resource.isBlank() ? this.issuer + "/mcp" : stripSlash(resource);
    this.consentUrl = consentUrl.strip();
  }

  /** Tests and defaults: the production consent page. */
  public CoachOAuthSettings(boolean enabled, String issuer, String resource) {
    this(enabled, issuer, resource, "https://pianoml.org/coach/authorize");
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

  /** The SPA consent page, on the same site as the API so that the session cookie travels on its calls. */
  public String consentUrl() {
    return consentUrl;
  }

  /** The protected resource metadata URL for the resource: its path appended to the well-known prefix (RFC 9728 3.1). */
  public String resourceMetadataUrl() {
    java.net.URI uri = java.net.URI.create(resource);
    String path = uri.getRawPath() == null ? "" : uri.getRawPath();
    return uri.getScheme() + "://" + uri.getRawAuthority() + "/.well-known/oauth-protected-resource" + path;
  }
}
