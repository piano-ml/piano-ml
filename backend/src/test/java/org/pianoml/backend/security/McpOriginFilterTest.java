package org.pianoml.backend.security;

import org.junit.jupiter.api.Test;
import org.pianoml.backend.config.McpSecurityConfigTestAccess;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The Origin rule of the /mcp chain (coach, issue #414): no Origin passes, an unlisted Origin gets 403. */
class McpOriginFilterTest {

  private static int status(List<String> allowed, String origin) throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/mcp");
    if (origin != null) {
      request.addHeader("Origin", origin);
    }
    MockHttpServletResponse response = new MockHttpServletResponse();
    McpSecurityConfigTestAccess.originFilter(allowed).doFilter(request, response, new MockFilterChain());
    return response.getStatus();
  }

  @Test
  void noOrigin_passes() throws Exception {
    assertThat(status(List.of(), null)).isEqualTo(200);
  }

  @Test
  void anyOrigin_isRefused_byDefault() throws Exception {
    assertThat(status(List.of(), "https://www.pianoml.org")).isEqualTo(403);
    assertThat(status(List.of(""), "https://www.pianoml.org")).isEqualTo(403);
  }

  @Test
  void listedOrigin_passes_otherOriginsDoNot() throws Exception {
    List<String> allowed = List.of(" https://host.example ");
    assertThat(status(allowed, "https://host.example")).isEqualTo(200);
    assertThat(status(allowed, "https://evil.example")).isEqualTo(403);
  }
}
