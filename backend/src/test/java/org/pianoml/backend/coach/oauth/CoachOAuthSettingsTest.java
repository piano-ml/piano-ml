package org.pianoml.backend.coach.oauth;

import org.junit.jupiter.api.Test;
import org.pianoml.backend.service.CoachGrantService;

import java.util.HashSet;

import static org.assertj.core.api.Assertions.assertThat;

class CoachOAuthSettingsTest {

  @Test
  void resource_defaultsToTheIssuerPlusMcp_withoutTrailingSlashes() {
    CoachOAuthSettings settings = new CoachOAuthSettings(true, " https://api.pianoml.org/ ", "");
    assertThat(settings.issuer()).isEqualTo("https://api.pianoml.org");
    assertThat(settings.resource()).isEqualTo("https://api.pianoml.org/mcp");
    assertThat(settings.resourceMetadataUrl())
      .isEqualTo("https://api.pianoml.org/.well-known/oauth-protected-resource/mcp");
  }

  @Test
  void anExplicitResource_keepsItsHostAndPath() {
    CoachOAuthSettings settings = new CoachOAuthSettings(true, "https://auth.example", "https://mcp.example:8443/v1/mcp/");
    assertThat(settings.resource()).isEqualTo("https://mcp.example:8443/v1/mcp");
    assertThat(settings.resourceMetadataUrl())
      .isEqualTo("https://mcp.example:8443/.well-known/oauth-protected-resource/v1/mcp");
  }

  @Test
  void advertisedScopes_areExactlyTheGrantScopes() {
    assertThat(new HashSet<>(CoachOAuthSettings.SCOPES)).isEqualTo(CoachGrantService.SCOPES);
  }
}
