package org.pianoml.backend.coach.oauth;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OAuth discovery documents for MCP clients (coach, issue #414; docs/coach-oauth-design.md 2.1).
 *
 * <p>Protected resource metadata (RFC 9728) at the path-suffixed and the root well-known locations, and
 * authorization server metadata (RFC 8414). Static, from {@link CoachOAuthSettings}: no database, nothing that
 * could make a cold instance slow (Claude gives discovery 10 seconds). Public, with CORS for any origin and no
 * credentials ({@code SecurityConfig}), because browser-based MCP clients read them too. 404 while OAuth is off.
 *
 * <p>Hand-written rather than generated from openapi/api.yaml: the paths and field names are fixed by the RFCs,
 * and the SPA never calls them.
 */
@RestController
public class OAuthMetadataController {

  private static final CacheControl CACHE = CacheControl.maxAge(Duration.ofHours(1)).cachePublic();

  private final CoachOAuthSettings settings;

  public OAuthMetadataController(CoachOAuthSettings settings) {
    this.settings = settings;
  }

  @GetMapping(path = {"/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"},
    produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> protectedResource() {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("resource", settings.resource());
    body.put("authorization_servers", List.of(settings.issuer()));
    body.put("scopes_supported", CoachOAuthSettings.SCOPES);
    body.put("bearer_methods_supported", List.of("header"));
    body.put("resource_name", "PianoML");
    return ResponseEntity.ok().cacheControl(CACHE).body(body);
  }

  @GetMapping(path = "/.well-known/oauth-authorization-server", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> authorizationServer() {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    String issuer = settings.issuer();
    List<String> scopes = new java.util.ArrayList<>(CoachOAuthSettings.SCOPES);
    scopes.add("offline_access"); // Claude asks for it, and gets a refresh token, only when it is listed
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("issuer", issuer);
    body.put("authorization_endpoint", issuer + "/oauth/authorize");
    body.put("token_endpoint", issuer + "/oauth/token");
    body.put("registration_endpoint", issuer + "/oauth/register");
    body.put("revocation_endpoint", issuer + "/oauth/revoke");
    body.put("response_types_supported", List.of("code"));
    body.put("grant_types_supported", List.of("authorization_code", "refresh_token"));
    body.put("code_challenge_methods_supported", List.of("S256"));
    body.put("token_endpoint_auth_methods_supported", List.of("none"));
    body.put("revocation_endpoint_auth_methods_supported", List.of("none"));
    body.put("client_id_metadata_document_supported", true);
    body.put("authorization_response_iss_parameter_supported", true);
    body.put("scopes_supported", scopes);
    return ResponseEntity.ok().cacheControl(CACHE).body(body);
  }
}
