package org.pianoml.backend.coach.oauth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.startsWith;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * OAuth discovery and the 401 challenge, with OAuth on (coach, issue #414, phase O1; docs/coach-oauth-design.md
 * 2.1 and 2.6). The trailing slash on the issuer checks that neither value ends with one.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"coach.oauth.enabled=true", "coach.oauth.issuer=https://api.pianoml.org/"})
class CoachOAuthDiscoveryTest {

  private static final String CHALLENGE = "Bearer realm=\"PianoML\", "
    + "resource_metadata=\"https://api.pianoml.org/.well-known/oauth-protected-resource/mcp\", "
    + "scope=\"practice:read scores:read player:control\"";

  @Autowired private MockMvc mockMvc;

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder toolsList() {
    return post("/mcp").contentType(MediaType.APPLICATION_JSON)
      .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
      .content("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}");
  }

  @Test
  void protectedResourceMetadata_atBothWellKnownPaths() throws Exception {
    for (String path : new String[]{"/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"}) {
      mockMvc.perform(get(path))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.resource").value("https://api.pianoml.org/mcp"))
        .andExpect(jsonPath("$.authorization_servers", contains("https://api.pianoml.org")))
        .andExpect(jsonPath("$.scopes_supported", contains("practice:read", "scores:read", "player:control")))
        .andExpect(jsonPath("$.bearer_methods_supported", contains("header")));
    }
  }

  @Test
  void authorizationServerMetadata_hasEveryFieldTheHostsNeed() throws Exception {
    mockMvc.perform(get("/.well-known/oauth-authorization-server"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.issuer").value("https://api.pianoml.org"))
      .andExpect(jsonPath("$.authorization_endpoint").value("https://api.pianoml.org/oauth/authorize"))
      .andExpect(jsonPath("$.token_endpoint").value("https://api.pianoml.org/oauth/token"))
      .andExpect(jsonPath("$.registration_endpoint").value("https://api.pianoml.org/oauth/register"))
      .andExpect(jsonPath("$.revocation_endpoint").value("https://api.pianoml.org/oauth/revoke"))
      .andExpect(jsonPath("$.response_types_supported", contains("code")))
      .andExpect(jsonPath("$.grant_types_supported", contains("authorization_code", "refresh_token")))
      .andExpect(jsonPath("$.code_challenge_methods_supported", contains("S256")))
      .andExpect(jsonPath("$.token_endpoint_auth_methods_supported", contains("none")))
      .andExpect(jsonPath("$.client_id_metadata_document_supported").value(true))
      .andExpect(jsonPath("$.authorization_response_iss_parameter_supported").value(true))
      .andExpect(jsonPath("$.scopes_supported",
        contains("practice:read", "scores:read", "player:control", "offline_access")));
  }

  @Test
  void discoveryDocuments_needNoSession_andAreReadableFromAnySite() throws Exception {
    mockMvc.perform(get("/.well-known/oauth-authorization-server").header("Origin", "https://harness.example"))
      .andExpect(status().isOk())
      .andExpect(header().string("Access-Control-Allow-Origin", "*"))
      .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"))
      // The main chain hands out its XSRF-TOKEN cookie on any GET; never a session
      .andExpect(header().stringValues("Set-Cookie", everyItem(not(startsWith("Authorization=")))));
  }

  @Test
  void anonymousMcpCall_getsTheChallenge_readableFromABrowser() throws Exception {
    mockMvc.perform(toolsList())
      .andExpect(status().isUnauthorized())
      .andExpect(header().string("WWW-Authenticate", CHALLENGE));
    mockMvc.perform(toolsList().header("Origin", "https://harness.example"))
      .andExpect(status().isUnauthorized())
      .andExpect(header().string("Access-Control-Allow-Origin", "*"))
      .andExpect(header().string("Access-Control-Expose-Headers", containsString("WWW-Authenticate")));
  }

  @Test
  void invalidToken_saysSo_inTheChallenge() throws Exception {
    mockMvc.perform(toolsList().header("Authorization", "Bearer pml_00000000000000000000000000000000_nope"))
      .andExpect(status().isUnauthorized())
      .andExpect(header().string("WWW-Authenticate",
        "Bearer realm=\"PianoML\", error=\"invalid_token\", "
          + CHALLENGE.substring("Bearer realm=\"PianoML\", ".length())));
  }

  @Test
  void preflight_fromAnySite_isAnsweredBeforeAuthentication_withoutCredentials() throws Exception {
    mockMvc.perform(options("/mcp")
        .header("Origin", "https://harness.example")
        .header("Access-Control-Request-Method", "POST")
        .header("Access-Control-Request-Headers", "authorization, content-type, mcp-protocol-version"))
      .andExpect(status().isOk())
      .andExpect(header().string("Access-Control-Allow-Origin", "*"))
      .andExpect(header().string("Access-Control-Allow-Methods", containsString("POST")))
      .andExpect(header().string("Access-Control-Allow-Headers", containsStringIgnoringCase("Mcp-Protocol-Version")))
      .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"))
      .andExpect(header().string("WWW-Authenticate", not(containsString("Bearer"))));
  }
}
