package org.pianoml.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The public GET endpoints are cacheable and set no cookie; everything else keeps the defaults. */
@SpringBootTest
@AutoConfigureMockMvc
class PublicCacheHeadersTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void aPublicEndpointIsCacheableWithAnEtagAndNoCookie() throws Exception {
    MvcResult result = mockMvc.perform(get("/genre")).andExpect(status().isOk()).andReturn();

    assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("max-age=300, public");
    assertThat(result.getResponse().getHeader("Pragma")).isNull();
    assertThat(result.getResponse().getHeaders("Set-Cookie")).isEmpty();
    String etag = result.getResponse().getHeader("ETag");
    assertThat(etag).isNotBlank();

    mockMvc.perform(get("/genre").header("If-None-Match", etag)).andExpect(status().isNotModified());
  }

  @Test
  void aMissingScoreIsNotCached() throws Exception {
    MvcResult result = mockMvc.perform(get("/score/no-such-score-for-cache-test")).andExpect(status().isNotFound()).andReturn();

    assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store");
  }

  @Test
  void aUserDependentEndpointKeepsNoStoreAndTheXsrfCookie() throws Exception {
    MvcResult result = mockMvc.perform(get("/score/search")).andReturn();

    assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store");
    assertThat(result.getResponse().getHeaders("Set-Cookie")).anyMatch(cookie -> cookie.startsWith("XSRF-TOKEN="));
  }
}
