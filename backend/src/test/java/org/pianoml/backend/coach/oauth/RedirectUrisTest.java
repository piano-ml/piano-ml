package org.pianoml.backend.coach.oauth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RedirectUrisTest {

  @ParameterizedTest
  @ValueSource(strings = {
    "https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector/oauth/abc123",
    "https://harness.example:8443/cb?x=1", "http://localhost/callback", "http://localhost:3118/callback",
    "http://127.0.0.1:50000/cb", "http://[::1]:8080/cb"
  })
  void allowed(String uri) {
    assertThat(RedirectUris.isAllowed(uri)).as(uri).isTrue();
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "http://harness.example/cb", "http://192.168.1.10/cb", "http://localhost.evil.example/cb",
    "myapp://callback", "javascript:alert(1)", "https://claude.ai/cb#frag", "https://user:pw@claude.ai/cb",
    "/relative/cb", "https:///nohost", "", "not a uri"
  })
  void refused(String uri) {
    assertThat(RedirectUris.isAllowed(uri)).as(uri).isFalse();
  }

  @Test
  void matching_isExact_forHttps() {
    List<String> registered = List.of("https://claude.ai/api/mcp/auth_callback");
    assertThat(RedirectUris.matches(registered, "https://claude.ai/api/mcp/auth_callback")).isTrue();
    assertThat(RedirectUris.matches(registered, "https://claude.ai/api/mcp/auth_callback/")).isFalse();
    assertThat(RedirectUris.matches(registered, "https://claude.ai/api/mcp/auth_callback?x=1")).isFalse();
    assertThat(RedirectUris.matches(registered, "https://claude.ai:444/api/mcp/auth_callback")).isFalse();
    assertThat(RedirectUris.matches(registered, "https://CLAUDE.ai/api/mcp/auth_callback")).isFalse();
    assertThat(RedirectUris.matches(registered, null)).isFalse();
  }

  @Test
  void loopback_matchesWhateverThePort_forLocalhost127And6() {
    List<String> registered = List.of("http://localhost/callback", "http://127.0.0.1/callback", "http://[::1]/callback");
    assertThat(RedirectUris.matches(registered, "http://localhost:3118/callback")).isTrue();
    assertThat(RedirectUris.matches(registered, "http://127.0.0.1:61234/callback")).isTrue();
    assertThat(RedirectUris.matches(registered, "http://[::1]:9999/callback")).isTrue();
    // but nothing else may change: host, path, query, scheme
    assertThat(RedirectUris.matches(List.of("http://localhost/callback"), "http://127.0.0.1:3118/callback")).isFalse();
    assertThat(RedirectUris.matches(registered, "http://localhost:3118/other")).isFalse();
    assertThat(RedirectUris.matches(registered, "http://localhost:3118/callback?x=1")).isFalse();
    assertThat(RedirectUris.matches(registered, "https://localhost:3118/callback")).isFalse();
    assertThat(RedirectUris.matches(List.of("https://harness.example/cb"), "https://harness.example:444/cb")).isFalse();
  }
}
