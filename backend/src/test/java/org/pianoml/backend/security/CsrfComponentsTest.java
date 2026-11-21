package org.pianoml.backend.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.DefaultCsrfToken;
import org.springframework.security.web.csrf.InvalidCsrfTokenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** Unit tests for the CSRF building blocks wired in SecurityConfig. */
class CsrfComponentsTest {

  // --- OriginAwareCsrfTokenRepository ----------------------------------------------------------------------

  private static String savedCookie(String origin) {
    OriginAwareCsrfTokenRepository repository = new OriginAwareCsrfTokenRepository();
    MockHttpServletRequest request = new MockHttpServletRequest();
    if (origin != null) {
      request.addHeader("Origin", origin);
    }
    MockHttpServletResponse response = new MockHttpServletResponse();
    repository.saveToken(repository.generateToken(request), request, response);
    return response.getHeader("Set-Cookie");
  }

  @Test
  void repository_sharesTheCookieWithPianomlSubdomainsOnly() {
    assertThat(savedCookie("https://www.pianoml.org")).contains("Domain=pianoml.org");
    assertThat(savedCookie("https://staging.pianoml.org")).contains("Domain=pianoml.org");
    assertThat(savedCookie("https://evil.example")).doesNotContain("Domain=");
    assertThat(savedCookie(null)).doesNotContain("Domain=");
  }

  @Test
  void repository_cookieIsReadableByJavaScript() {
    assertThat(savedCookie(null)).startsWith("XSRF-TOKEN=").doesNotContain("HttpOnly");
  }

  @Test
  void repository_loadsTheTokenFromTheCookieWhateverItsDomain() {
    OriginAwareCsrfTokenRepository repository = new OriginAwareCsrfTokenRepository();
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setCookies(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "abc"));
    CsrfToken token = repository.loadToken(request);
    assertThat(token.getToken()).isEqualTo("abc");
    assertThat(token.getHeaderName()).isEqualTo("X-XSRF-TOKEN");
  }

  @Test
  void repository_withSeveralXsrfCookies_loadsTheOneTheRequestEchoes() {
    OriginAwareCsrfTokenRepository repository = new OriginAwareCsrfTokenRepository();
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setCookies(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "stale"), new jakarta.servlet.http.Cookie("XSRF-TOKEN", "fresh"));
    assertThat(repository.loadToken(request).getToken()).as("no header: the first").isEqualTo("stale");

    request.addHeader("X-XSRF-TOKEN", "fresh");
    CsrfToken token = repository.loadToken(request);
    assertThat(token.getToken()).isEqualTo("fresh");
    assertThat(token.getHeaderName()).isEqualTo("X-XSRF-TOKEN");
  }

  @Test
  void repository_withSeveralXsrfCookies_aHeaderMatchingNoneLoadsTheFirst() {
    OriginAwareCsrfTokenRepository repository = new OriginAwareCsrfTokenRepository();
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setCookies(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "a"), new jakarta.servlet.http.Cookie("XSRF-TOKEN", "b"));
    request.addHeader("X-XSRF-TOKEN", "forged");
    assertThat(repository.loadToken(request).getToken()).isEqualTo("a");
  }

  @Test
  void isPianomlHost() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setServerName("api.pianoml.org");
    assertThat(OriginAwareCsrfTokenRepository.isPianomlHost(request)).isTrue();
    request.setServerName("pianoml.org");
    assertThat(OriginAwareCsrfTokenRepository.isPianomlHost(request)).isTrue();
    request.setServerName("localhost");
    assertThat(OriginAwareCsrfTokenRepository.isPianomlHost(request)).isFalse();
    request.setServerName("evilpianoml.org");
    assertThat(OriginAwareCsrfTokenRepository.isPianomlHost(request)).isFalse();
  }

  @Test
  void staleHostOnlyCookie_isExpiredOnlyOnAPianomlHostWithSeveralXsrfCookies() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setServerName("api.pianoml.org");
    request.setCookies(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "only"));
    org.springframework.mock.web.MockHttpServletResponse response = new org.springframework.mock.web.MockHttpServletResponse();
    OriginAwareCsrfTokenRepository.expireStaleHostOnlyCookie(request, response);
    assertThat(response.getHeaders("Set-Cookie")).as("one cookie: nothing to clean").isEmpty();

    request.setCookies(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "a"), new jakarta.servlet.http.Cookie("XSRF-TOKEN", "b"));
    OriginAwareCsrfTokenRepository.expireStaleHostOnlyCookie(request, response);
    assertThat(response.getHeaders("Set-Cookie")).singleElement().satisfies(h ->
      assertThat(h).startsWith("XSRF-TOKEN=;").contains("Path=/", "Max-Age=0", "Secure").doesNotContain("Domain="));

    MockHttpServletRequest local = new MockHttpServletRequest();
    local.setCookies(new jakarta.servlet.http.Cookie("XSRF-TOKEN", "a"), new jakarta.servlet.http.Cookie("XSRF-TOKEN", "b"));
    org.springframework.mock.web.MockHttpServletResponse localResponse = new org.springframework.mock.web.MockHttpServletResponse();
    OriginAwareCsrfTokenRepository.expireStaleHostOnlyCookie(local, localResponse);
    assertThat(localResponse.getHeaders("Set-Cookie")).as("localhost: left alone").isEmpty();
  }

  @Test
  void isPianomlOrigin() {
    assertThat(OriginAwareCsrfTokenRepository.isPianomlOrigin("https://pianoml.org")).isTrue();
    assertThat(OriginAwareCsrfTokenRepository.isPianomlOrigin("http://localhost:4200")).isFalse();
    assertThat(OriginAwareCsrfTokenRepository.isPianomlOrigin(null)).isFalse();
  }

  // --- CsrfCookieFilter ------------------------------------------------------------------------------------

  @Test
  void filter_loadsTheDeferredToken_soTheCookieIsWritten() throws Exception {
    CsrfToken token = mock(CsrfToken.class);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setAttribute(CsrfToken.class.getName(), token);
    FilterChain chain = mock(FilterChain.class);
    MockHttpServletResponse response = new MockHttpServletResponse();

    new CsrfCookieFilter().doFilter(request, response, chain);

    verify(token).getToken();
    verify(chain).doFilter(request, response);
  }

  @Test
  void filter_passesThroughWhenThereIsNoCsrfToken() throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    new CsrfCookieFilter().doFilter(request, response, chain);

    verify(chain).doFilter(request, response);
  }

  // --- CsrfAwareAccessDeniedHandler ------------------------------------------------------------------------

  @Test
  void handler_csrfRejection_hasTheCsrfCode() throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    new CsrfAwareAccessDeniedHandler().handle(new MockHttpServletRequest(), response,
      new InvalidCsrfTokenException(new DefaultCsrfToken("X-XSRF-TOKEN", "_csrf", "a"), "b"));
    assertThat(response.getStatus()).isEqualTo(403);
    assertThat(response.getContentType()).isEqualTo("application/json");
    assertThat(response.getContentAsString()).isEqualTo("{\"error\":\"CSRF_TOKEN_INVALID\"}");
  }

  @Test
  void handler_otherDenial_hasTheAccessDeniedCode() throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    new CsrfAwareAccessDeniedHandler().handle(new MockHttpServletRequest(), response, new AccessDeniedException("no"));
    assertThat(response.getStatus()).isEqualTo(403);
    assertThat(response.getContentAsString()).isEqualTo("{\"error\":\"ACCESS_DENIED\"}");
  }

  @Test
  void handler_leavesACommittedResponseAlone() throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    response.setStatus(200);
    response.getWriter().write("partial");
    response.flushBuffer();

    new CsrfAwareAccessDeniedHandler().handle(new MockHttpServletRequest(), response, new AccessDeniedException("no"));

    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getContentAsString()).isEqualTo("partial");
  }
}
