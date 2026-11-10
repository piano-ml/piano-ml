package org.pianoml.backend.config;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.AuthorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end CSRF behaviour through the real filter chain, authenticating like the browser does
 * (JWT in the HttpOnly "Authorization" cookie) or like scripts do (Authorization header).
 *
 * <p>Fresh context: other tests use SecurityMockMvcRequestPostProcessors.csrf(), which swaps the CsrfFilter's
 * repository in the shared context for a test one that never writes the XSRF-TOKEN cookie.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class CsrfProtectionTest {

  private static final String BODY = "{\"name\":\"x\"}";

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtTokenProvider jwtTokenProvider;

  @Autowired
  private UserRepository userRepository;

  @Autowired
  private PasswordEncoder passwordEncoder;

  @MockitoBean
  private AuthorService authorService;

  private String jwtForNewUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("csrf-test");
    user.setPassword("x");
    user.setRoles("USER");
    user.setVerified(true);
    return jwtTokenProvider.generateToken(userRepository.save(user));
  }

  private Cookie xsrfCookieFromAGet(String origin) throws Exception {
    MockHttpServletRequestBuilder request = get("/author/search/{q}", "x");
    if (origin != null) {
      request = request.header("Origin", origin);
    }
    MvcResult result = mockMvc.perform(request).andReturn();
    Cookie cookie = xsrfCookie(result);
    assertThat(cookie).as("XSRF-TOKEN cookie issued on a plain GET").isNotNull();
    return cookie;
  }

  /** CookieCsrfTokenRepository writes a raw Set-Cookie header; parse it (name, value, Domain, HttpOnly). */
  private static Cookie xsrfCookie(MvcResult result) {
    for (String header : result.getResponse().getHeaders("Set-Cookie")) {
      if (!header.startsWith("XSRF-TOKEN=")) {
        continue;
      }
      String[] parts = header.split(";\\s*");
      Cookie cookie = new Cookie("XSRF-TOKEN", parts[0].substring("XSRF-TOKEN=".length()));
      for (int i = 1; i < parts.length; i++) {
        String attr = parts[i];
        if (attr.regionMatches(true, 0, "Domain=", 0, 7)) {
          cookie.setDomain(attr.substring(7));
        } else if (attr.equalsIgnoreCase("HttpOnly")) {
          cookie.setHttpOnly(true);
        }
      }
      return cookie;
    }
    return null;
  }

  @Test
  void get_withoutOrigin_issuesReadableHostOnlyXsrfCookie() throws Exception {
    // Same-origin requests (and the dev proxy, which strips Origin) carry no Origin header.
    Cookie cookie = xsrfCookieFromAGet(null);
    assertThat(cookie.isHttpOnly()).isFalse();
    assertThat(cookie.getDomain()).isNull();
    assertThat(cookie.getValue()).isNotBlank();
  }

  @Test
  void get_fromPianomlOrigin_sharesXsrfCookieWithSubdomains() throws Exception {
    Cookie cookie = xsrfCookieFromAGet("https://pianoml.org");
    assertThat(cookie.getDomain()).isEqualTo(".pianoml.org");
  }

  @Test
  void cookieAuthenticatedPut_withoutToken_isRejected() throws Exception {
    mockMvc.perform(put("/author/{id}", UUID.randomUUID())
        .cookie(new Cookie("Authorization", jwtForNewUser()))
        .contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isForbidden());
  }

  @Test
  void cookieAuthenticatedPut_withWrongToken_isRejected() throws Exception {
    Cookie xsrf = xsrfCookieFromAGet(null);
    mockMvc.perform(put("/author/{id}", UUID.randomUUID())
        .cookie(new Cookie("Authorization", jwtForNewUser()), xsrf)
        .header("X-XSRF-TOKEN", "forged")
        .contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isForbidden());
  }

  @Test
  void cookieAuthenticatedPut_withDoubleSubmittedToken_isAccepted() throws Exception {
    given(authorService.updateAuthor(any(), any(AuthorApiInfo.class), anyBoolean()))
      .willReturn(Optional.of(new AuthorApiInfo()));
    Cookie xsrf = xsrfCookieFromAGet(null);

    mockMvc.perform(put("/author/{id}", UUID.randomUUID())
        .cookie(new Cookie("Authorization", jwtForNewUser()), xsrf)
        .header("X-XSRF-TOKEN", xsrf.getValue())
        .contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isOk());
  }

  @Test
  void bearerHeaderClient_isNotSubjectToCsrf() throws Exception {
    given(authorService.updateAuthor(any(), any(AuthorApiInfo.class), anyBoolean()))
      .willReturn(Optional.of(new AuthorApiInfo()));

    mockMvc.perform(put("/author/{id}", UUID.randomUUID())
        .header("Authorization", "Bearer " + jwtForNewUser())
        .contentType(MediaType.APPLICATION_JSON).content(BODY))
      .andExpect(status().isOk());
  }

  @Test
  void localhostOrigin_isNoLongerAllowedByCors() throws Exception {
    // Local development must go through the dev proxy (frontend/proxy.conf.mjs).
    mockMvc.perform(get("/author/search/{q}", "x").header("Origin", "http://localhost:4200"))
      .andExpect(status().isForbidden());
  }

  private MvcResult login() throws Exception {
    String email = UUID.randomUUID() + "@example.com";
    User user = new User();
    user.setEmail(email);
    user.setName("csrf-login");
    user.setPassword(passwordEncoder.encode("secret"));
    user.setRoles("USER");
    user.setVerified(true);
    userRepository.save(user);

    return mockMvc.perform(post("/account/login")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"" + email + "\",\"password\":\"secret\"}"))
      .andExpect(status().isOk())
      .andReturn();
  }

  private static String authSetCookie(MvcResult result, boolean legacy) {
    return result.getResponse().getHeaders("Set-Cookie").stream()
      .filter(h -> h.startsWith("Authorization="))
      .filter(h -> h.contains("Domain=.pianoml.org") == legacy)
      .findFirst().orElseThrow();
  }

  @Test
  void login_doesNotRequireToken_andIssuesXsrfCookie() throws Exception {
    MvcResult result = login();
    // Both cookies must be separate Set-Cookie headers (what a real servlet container sends).
    assertThat(result.getResponse().getHeaders("Set-Cookie"))
      .anyMatch(h -> h.startsWith("Authorization="))
      .anyMatch(h -> h.startsWith("XSRF-TOKEN="));
  }

  @Test
  void login_setsStrictHostOnlySecureAuthCookie_andExpiresLegacySharedOne() throws Exception {
    MvcResult result = login();

    String auth = authSetCookie(result, false);
    assertThat(auth).contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/").doesNotContain("Domain=");
    assertThat(auth).doesNotStartWith("Authorization=;");

    String legacy = authSetCookie(result, true);
    assertThat(legacy).startsWith("Authorization=;").contains("Max-Age=0");
  }

  @Test
  void logout_isPostOnly_csrfProtected_andExpiresBothCookies() throws Exception {
    mockMvc.perform(get("/account/logout")).andExpect(status().isMethodNotAllowed());
    mockMvc.perform(post("/account/logout")).andExpect(status().isForbidden());

    Cookie xsrf = xsrfCookieFromAGet(null);
    MvcResult result = mockMvc.perform(post("/account/logout")
        .cookie(xsrf)
        .header("X-XSRF-TOKEN", xsrf.getValue()))
      .andExpect(status().isOk())
      .andReturn();

    assertThat(authSetCookie(result, false)).startsWith("Authorization=;").contains("Max-Age=0", "SameSite=Strict");
    assertThat(authSetCookie(result, true)).startsWith("Authorization=;").contains("Max-Age=0");
  }
}
