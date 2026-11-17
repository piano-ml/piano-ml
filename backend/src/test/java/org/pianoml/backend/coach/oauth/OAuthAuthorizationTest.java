package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Authorization and consent (coach OAuth, issue #414, phase O3; docs/coach-oauth-design.md 2.3). */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"coach.oauth.enabled=true", "coach.oauth.issuer=https://api.pianoml.org",
  "coach.oauth.consent-url=https://www.pianoml.org/coach/authorize"})
class OAuthAuthorizationTest {

  private static final String REDIRECT = "https://harness.example/callback";
  private static final String CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"; // RFC 7636 appendix B

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private CoachOAuthClientService clients;

  private final ObjectMapper json = new ObjectMapper();
  private final String run = UUID.randomUUID().toString().substring(0, 8);
  private final List<UUID> users = new ArrayList<>();
  private String clientId;

  @BeforeEach
  void registerClient() throws Exception {
    clientId = clients.register(json.readTree(json.writeValueAsString(Map.of(
      "client_name", "Harness " + run,
      "redirect_uris", List.of(REDIRECT, "http://127.0.0.1/cb"))))).clientId();
  }

  @AfterEach
  void cleanup() {
    jdbc.update("DELETE FROM pianoml.coach_oauth_request WHERE client_id = ?", clientId);
    jdbc.update("DELETE FROM pianoml.coach_oauth_code WHERE client_id = ?", clientId);
    jdbc.update("DELETE FROM pianoml.coach_oauth_client WHERE client_name LIKE ?", "%" + run + "%");
    for (UUID id : users) {
      jdbc.update("DELETE FROM pianoml.coach_oauth_request WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", id);
    }
  }

  // --- helpers ---------------------------------------------------------------------------------------------------

  private Map<String, String> params() {
    Map<String, String> p = new LinkedHashMap<>();
    p.put("response_type", "code");
    p.put("client_id", clientId);
    p.put("redirect_uri", REDIRECT);
    p.put("code_challenge", CHALLENGE);
    p.put("code_challenge_method", "S256");
    p.put("scope", "practice:read scores:read");
    p.put("resource", "https://api.pianoml.org/mcp");
    p.put("state", "xyz-" + run);
    return p;
  }

  private MvcResult authorize(Map<String, String> params) throws Exception {
    MockHttpServletRequestBuilder request = get("/oauth/authorize");
    params.forEach((k, v) -> {
      if (v != null) {
        request.param(k, v);
      }
    });
    return mockMvc.perform(request).andReturn();
  }

  private static Map<String, String> query(String url) {
    Map<String, String> q = new LinkedHashMap<>();
    UriComponentsBuilder.fromUriString(url).build().getQueryParams()
      .forEach((k, v) -> q.put(k, v.get(0) == null ? null : java.net.URLDecoder.decode(v.get(0), java.nio.charset.StandardCharsets.UTF_8)));
    return q;
  }

  /** A stored request's id, from the consent page URL the authorize endpoint redirects to. */
  private String requestId(Map<String, String> params) throws Exception {
    MvcResult result = authorize(params);
    assertThat(result.getResponse().getStatus()).isEqualTo(302);
    String location = result.getResponse().getHeader("Location");
    assertThat(location).startsWith("https://www.pianoml.org/coach/authorize?request=");
    return query(location).get("request");
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("pianist-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    users.add(saved.getId());
    return saved;
  }

  private Cookie session(User user) {
    return new Cookie("Authorization", jwtTokenProvider.generateToken(user));
  }

  private RequestPostProcessor xsrf() throws Exception {
    String token = mockMvc.perform(get("/author/search/{q}", "x")).andReturn().getResponse().getHeaders("Set-Cookie")
      .stream().filter(h -> h.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow()
      .split(";")[0].substring("XSRF-TOKEN=".length());
    return request -> {
      Cookie[] existing = request.getCookies() == null ? new Cookie[0] : request.getCookies();
      Cookie[] cookies = java.util.Arrays.copyOf(existing, existing.length + 1);
      cookies[existing.length] = new Cookie("XSRF-TOKEN", token);
      request.setCookies(cookies);
      request.addHeader("X-XSRF-TOKEN", token);
      return request;
    };
  }

  private org.springframework.test.web.servlet.ResultActions decide(String id, User user, Object body) throws Exception {
    return mockMvc.perform(post("/oauth/requests/{id}/decision", id).with(xsrf()).cookie(session(user))
      .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  private String redirectUrl(org.springframework.test.web.servlet.ResultActions actions) throws Exception {
    JsonNode body = json.readTree(actions.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    return body.get("redirectUrl").asString();
  }

  // --- GET /oauth/authorize --------------------------------------------------------------------------------------

  @Test
  void aValidRequest_isStored_andSentToTheConsentPage_withoutAnySession() throws Exception {
    String id = requestId(params());
    assertThat(id).matches("[A-Za-z0-9_-]{43}");
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM pianoml.coach_oauth_request WHERE id_hash = ?", OAuthSecrets.hash(id));
    assertThat(row.get("client_id")).isEqualTo(clientId);
    assertThat(row.get("client_name")).isEqualTo("Harness " + run);
    assertThat(row.get("client_host")).isNull(); // dynamically registered: nobody vouches for it
    assertThat(row.get("scopes")).isEqualTo("practice:read scores:read");
    assertThat(row.get("resource")).isEqualTo("https://api.pianoml.org/mcp");
    assertThat(row.get("user_id")).isNull();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_oauth_request WHERE id_hash = ?", Long.class, id)).isZero();
  }

  @Test
  void untrustedClientOrRedirect_getsAnErrorPage_neverARedirect() throws Exception {
    List<Map<String, String>> cases = new ArrayList<>();
    Map<String, String> noClient = params();
    noClient.remove("client_id");
    cases.add(noClient);
    Map<String, String> unknownClient = params();
    unknownClient.put("client_id", "pmc_00000000000000000000000000000000");
    cases.add(unknownClient);
    Map<String, String> otherRedirect = params();
    otherRedirect.put("redirect_uri", "https://evil.example/callback");
    cases.add(otherRedirect);
    Map<String, String> noRedirect = params();
    noRedirect.remove("redirect_uri");
    cases.add(noRedirect);
    Map<String, String> badCimd = params();
    badCimd.put("client_id", "http://insecure.example/meta");
    cases.add(badCimd);
    for (Map<String, String> c : cases) {
      MvcResult result = authorize(c);
      assertThat(result.getResponse().getStatus()).as(c.toString()).isEqualTo(400);
      assertThat(result.getResponse().getHeader("Location")).isNull();
      assertThat(result.getResponse().getContentType()).startsWith("text/html");
      assertThat(result.getResponse().getHeader("Content-Security-Policy")).contains("frame-ancestors 'none'");
    }
    // A repeated client_id or redirect_uri is refused on the page too
    mockMvc.perform(get("/oauth/authorize").param("client_id", clientId, clientId).param("redirect_uri", REDIRECT))
      .andExpect(status().isBadRequest()).andExpect(header().doesNotExist("Location"));
  }

  @Test
  void theErrorPage_escapesWhatItShows() {
    assertThat(OAuthAuthorizeController.page("<script>x</script>")).contains("&lt;script&gt;").doesNotContain("<script>");
  }

  @Test
  void otherErrors_goBackToTheClient_withStateAndIss() throws Exception {
    record Case(String key, String value, String error) {
    }
    for (Case c : List.of(
      new Case("response_type", "token", "unsupported_response_type"),
      new Case("response_type", null, "unsupported_response_type"),
      new Case("code_challenge", null, "invalid_request"),
      new Case("code_challenge", "too-short", "invalid_request"),
      new Case("code_challenge_method", "plain", "invalid_request"),
      new Case("code_challenge_method", null, "invalid_request"),
      new Case("resource", "https://other.example/mcp", "invalid_target"),
      new Case("resource", "https://api.pianoml.org/mcp/", "invalid_target"),
      new Case("scope", "practice:read admin", "invalid_scope"))) {
      Map<String, String> p = params();
      p.put(c.key(), c.value());
      MvcResult result = authorize(p);
      assertThat(result.getResponse().getStatus()).as(c.toString()).isEqualTo(302);
      String location = result.getResponse().getHeader("Location");
      assertThat(location).as(c.toString()).startsWith(REDIRECT + "?");
      Map<String, String> q = query(location);
      assertThat(q.get("error")).as(c.toString()).isEqualTo(c.error());
      assertThat(q.get("state")).isEqualTo("xyz-" + run);
      assertThat(q.get("iss")).isEqualTo("https://api.pianoml.org");
      assertThat(q).doesNotContainKey("code");
    }
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_oauth_request WHERE client_id = ?", Long.class, clientId)).isZero();
  }

  @Test
  void defaults_noResourceMeansTheOnlyOne_noScopeMeansAll_offlineAccessIgnored_stateOptional() throws Exception {
    Map<String, String> p = params();
    p.remove("resource");
    p.remove("scope");
    p.remove("state");
    String id = requestId(p);
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM pianoml.coach_oauth_request WHERE id_hash = ?", OAuthSecrets.hash(id));
    assertThat(row.get("resource")).isEqualTo("https://api.pianoml.org/mcp");
    assertThat(row.get("scopes")).isEqualTo("practice:read scores:read player:control");
    assertThat(row.get("state")).isNull();

    Map<String, String> offline = params();
    offline.put("scope", "player:control offline_access practice:read");
    String id2 = requestId(offline);
    assertThat(jdbc.queryForObject("SELECT scopes FROM pianoml.coach_oauth_request WHERE id_hash = ?", String.class,
      OAuthSecrets.hash(id2))).isEqualTo("practice:read player:control");
  }

  @Test
  void loopbackRedirect_onAnyPort_isAccepted() throws Exception {
    Map<String, String> p = params();
    p.put("redirect_uri", "http://127.0.0.1:53682/cb");
    requestId(p);
  }

  // --- consent ---------------------------------------------------------------------------------------------------

  @Test
  void consentView_showsWhatTheUserNeedsToJudge_andNeedsTheSession() throws Exception {
    String id = requestId(params());
    mockMvc.perform(get("/oauth/requests/{id}", id)).andExpect(status().isUnauthorized());
    User user = newUser();
    mockMvc.perform(get("/oauth/requests/{id}", id).cookie(session(user)))
      .andExpect(status().isOk())
      .andExpect(header().string("Cache-Control", "no-store"))
      .andExpect(jsonPath("$.clientName").value("Harness " + run))
      .andExpect(jsonPath("$.clientHost").value(nullValue()))
      .andExpect(jsonPath("$.redirectHost").value("harness.example"))
      .andExpect(jsonPath("$.loopbackOnly").value(false))
      .andExpect(jsonPath("$.scopes", contains("practice:read", "scores:read")));
  }

  @Test
  void theRequest_belongsToTheFirstUserWhoOpensIt() throws Exception {
    String id = requestId(params());
    User first = newUser();
    User other = newUser();
    mockMvc.perform(get("/oauth/requests/{id}", id).cookie(session(first))).andExpect(status().isOk());
    mockMvc.perform(get("/oauth/requests/{id}", id).cookie(session(other))).andExpect(status().isNotFound());
    decide(id, other, Map.of("approve", true)).andExpect(status().isNotFound());
    decide(id, first, Map.of("approve", true)).andExpect(status().isOk());
  }

  @Test
  void approving_givesAOneTimeCode_boundToEverything_andTheRequestIsSingleUse() throws Exception {
    String id = requestId(params());
    User user = newUser();
    String url = redirectUrl(decide(id, user, Map.of("approve", true)));
    assertThat(url).startsWith(REDIRECT + "?code=");
    Map<String, String> q = query(url);
    assertThat(q.get("state")).isEqualTo("xyz-" + run);
    assertThat(q.get("iss")).isEqualTo("https://api.pianoml.org");
    String code = q.get("code");
    assertThat(code).matches("[A-Za-z0-9_-]{43}");

    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM pianoml.coach_oauth_code WHERE code_hash = ?", OAuthSecrets.hash(code));
    assertThat(row.get("client_id")).isEqualTo(clientId);
    assertThat(row.get("redirect_uri")).isEqualTo(REDIRECT);
    assertThat(row.get("code_challenge")).isEqualTo(CHALLENGE);
    assertThat(row.get("scopes")).isEqualTo("practice:read scores:read");
    assertThat(row.get("resource")).isEqualTo("https://api.pianoml.org/mcp");
    assertThat(row.get("user_id")).isEqualTo(user.getId());
    assertThat(row.get("used_at")).isNull();
    assertThat(jdbc.queryForObject("SELECT last_used_at FROM pianoml.coach_oauth_client WHERE client_id = ?",
      java.sql.Timestamp.class, clientId)).isNotNull();

    decide(id, user, Map.of("approve", true)).andExpect(status().isNotFound());
    mockMvc.perform(get("/oauth/requests/{id}", id).cookie(session(user))).andExpect(status().isNotFound());
  }

  @Test
  void theUserMayGrantLess_butNotMore() throws Exception {
    String id = requestId(params());
    User user = newUser();
    decide(id, user, Map.of("approve", true, "scopes", List.of("player:control"))).andExpect(status().isBadRequest());
    String url = redirectUrl(decide(id, user, Map.of("approve", true, "scopes", List.of("scores:read"))));
    assertThat(jdbc.queryForObject("SELECT scopes FROM pianoml.coach_oauth_code WHERE code_hash = ?", String.class,
      OAuthSecrets.hash(query(url).get("code")))).isEqualTo("scores:read");
  }

  @Test
  void refusing_givesAccessDenied_andNoCode() throws Exception {
    String id = requestId(params());
    String url = redirectUrl(decide(id, newUser(), Map.of("approve", false)));
    Map<String, String> q = query(url);
    assertThat(q.get("error")).isEqualTo("access_denied");
    assertThat(q.get("state")).isEqualTo("xyz-" + run);
    assertThat(q.get("iss")).isEqualTo("https://api.pianoml.org");
    assertThat(q).doesNotContainKey("code");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_oauth_code WHERE client_id = ?", Long.class, clientId)).isZero();
  }

  @Test
  void anExpiredRequest_cannotBeOpenedNorDecided() throws Exception {
    String id = requestId(params());
    jdbc.update("UPDATE pianoml.coach_oauth_request SET expires_at = ? WHERE id_hash = ?",
      OffsetDateTime.now().minusSeconds(1), OAuthSecrets.hash(id));
    User user = newUser();
    mockMvc.perform(get("/oauth/requests/{id}", id).cookie(session(user))).andExpect(status().isNotFound());
    decide(id, user, Map.of("approve", true)).andExpect(status().isNotFound());
  }

  @Test
  void theDecision_needsTheCsrfToken() throws Exception {
    String id = requestId(params());
    mockMvc.perform(post("/oauth/requests/{id}/decision", id).cookie(session(newUser()))
        .contentType(MediaType.APPLICATION_JSON).content("{\"approve\":true}"))
      .andExpect(status().isForbidden());
  }

  @Test
  void aRedirectUriWithAQuery_keepsIt() throws Exception {
    String withQuery = "https://harness.example/cb?tenant=a%20b";
    clientId = clients.register(json.readTree(json.writeValueAsString(Map.of(
      "client_name", "Query " + run, "redirect_uris", List.of(withQuery))))).clientId();
    Map<String, String> p = params();
    p.put("client_id", clientId);
    p.put("redirect_uri", withQuery);
    String url = redirectUrl(decide(requestId(p), newUser(), Map.of("approve", false)));
    assertThat(url).startsWith(withQuery + "&error=access_denied");
  }
}
