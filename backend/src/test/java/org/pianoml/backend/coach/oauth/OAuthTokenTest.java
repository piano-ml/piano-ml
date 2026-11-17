package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.coach.McpTestClient;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tokens (coach OAuth, issue #414, phase O4; docs/coach-oauth-design.md 2.4 and 2.5). */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"coach.oauth.enabled=true", "coach.oauth.issuer=https://api.pianoml.org"})
class OAuthTokenTest {

  private static final String REDIRECT = "https://harness.example/callback";
  // RFC 7636 appendix B
  private static final String VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  private static final String CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  private static final String RESOURCE = "https://api.pianoml.org/mcp";

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private CoachOAuthClientService clients;
  @Autowired private CoachOAuthAuthorizationService authorization;
  @Autowired private CoachGrantService grantService;

  private final ObjectMapper json = new ObjectMapper();
  private final String run = UUID.randomUUID().toString().substring(0, 8);
  private final List<UUID> users = new ArrayList<>();
  private final List<String> clientIds = new ArrayList<>();
  private String clientId;
  private User user;

  @BeforeEach
  void setUp() throws Exception {
    clientId = newClient("Harness");
    user = newUser();
  }

  @AfterEach
  void cleanup() {
    for (String id : clientIds) {
      jdbc.update("DELETE FROM pianoml.coach_oauth_code WHERE client_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_oauth_request WHERE client_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_oauth_client WHERE client_id = ?", id);
    }
    for (UUID id : users) {
      jdbc.update("DELETE FROM pianoml.coach_oauth_token WHERE grant_id IN (SELECT id FROM pianoml.coach_grant WHERE user_id = ?)", id);
      jdbc.update("DELETE FROM pianoml.coach_oauth_code WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_oauth_request WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.coach_grant WHERE user_id = ?", id);
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", id);
    }
  }

  // --- helpers ---------------------------------------------------------------------------------------------------

  private String newClient(String name) throws Exception {
    String id = clients.register(json.readTree(json.writeValueAsString(Map.of(
      "client_name", name + " " + run, "redirect_uris", List.of(REDIRECT))))).clientId();
    clientIds.add(id);
    return id;
  }

  private User newUser() {
    User u = new User();
    u.setEmail(UUID.randomUUID() + "@example.com");
    u.setName("pianist-" + UUID.randomUUID());
    u.setPassword("{noop}unused");
    u.setRoles("USER");
    u.setVerified(true);
    User saved = userRepository.save(u);
    users.add(saved.getId());
    return saved;
  }

  /** A code, through the real authorize and decide steps. */
  private String code(String client, User who, String scope) {
    Map<String, String[]> p = new LinkedHashMap<>();
    p.put("response_type", new String[]{"code"});
    p.put("client_id", new String[]{client});
    p.put("redirect_uri", new String[]{REDIRECT});
    p.put("code_challenge", new String[]{CHALLENGE});
    p.put("code_challenge_method", new String[]{"S256"});
    p.put("scope", new String[]{scope});
    var outcome = (CoachOAuthAuthorizationService.Outcome.Redirect) authorization.authorize(p);
    String requestId = query(outcome.url()).get("request");
    String url = authorization.decide(requestId, who.getId(), true, null).orElseThrow();
    return query(url).get("code");
  }

  private String code() {
    return code(clientId, user, "practice:read scores:read");
  }

  private static Map<String, String> query(String url) {
    Map<String, String> q = new LinkedHashMap<>();
    UriComponentsBuilder.fromUriString(url).build().getQueryParams()
      .forEach((k, v) -> q.put(k, URLDecoder.decode(v.get(0), StandardCharsets.UTF_8)));
    return q;
  }

  private ResultActions token(Map<String, String> form) throws Exception {
    MockHttpServletRequestBuilder request = post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED);
    form.forEach((k, v) -> {
      if (v != null) {
        request.param(k, v);
      }
    });
    return mockMvc.perform(request);
  }

  private Map<String, String> codeForm(String code) {
    Map<String, String> f = new LinkedHashMap<>();
    f.put("grant_type", "authorization_code");
    f.put("code", code);
    f.put("client_id", clientId);
    f.put("redirect_uri", REDIRECT);
    f.put("code_verifier", VERIFIER);
    f.put("resource", RESOURCE);
    return f;
  }

  private Map<String, String> refreshForm(String refreshToken) {
    Map<String, String> f = new LinkedHashMap<>();
    f.put("grant_type", "refresh_token");
    f.put("refresh_token", refreshToken);
    f.put("client_id", clientId);
    return f;
  }

  private JsonNode ok(ResultActions actions) throws Exception {
    return json.readTree(actions.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
  }

  private void expectError(ResultActions actions, String error) throws Exception {
    actions.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value(error))
      .andExpect(header().string("Cache-Control", "no-store"));
  }

  private int mcpStatus(String accessToken) throws Exception {
    return new McpTestClient(mockMvc).send(accessToken, "tools/list", Map.of()).andReturn().getResponse().getStatus();
  }

  private UUID grantOf(String accessToken) {
    return jdbc.queryForObject("SELECT grant_id FROM pianoml.coach_oauth_token WHERE token_hash = ?", UUID.class,
      OAuthSecrets.hash(accessToken));
  }

  private Cookie session(User who) {
    return new Cookie("Authorization", jwtTokenProvider.generateToken(who));
  }

  // --- the code exchange -----------------------------------------------------------------------------------------

  @Test
  void pkce_rfc7636TestVector() {
    assertThat(CoachOAuthTokenService.s256Matches(VERIFIER, CHALLENGE)).isTrue();
    assertThat(CoachOAuthTokenService.s256Matches(VERIFIER + "x", CHALLENGE)).isFalse();
  }

  @Test
  void aCode_becomesAGrantAndTokens_thatWorkOnMcp_withTheGrantedScopes() throws Exception {
    JsonNode body = ok(token(codeForm(code())).andExpect(header().string("Cache-Control", "no-store")));
    String access = body.get("access_token").asString();
    assertThat(access).matches("pmo_[A-Za-z0-9_-]{43}");
    assertThat(body.get("refresh_token").asString()).matches("pmr_[A-Za-z0-9_-]{43}");
    assertThat(body.get("token_type").asString()).isEqualTo("Bearer");
    assertThat(body.get("expires_in").asLong()).isEqualTo(3600);
    assertThat(body.get("scope").asString()).isEqualTo("practice:read scores:read");

    Map<String, Object> grant = jdbc.queryForMap("SELECT * FROM pianoml.coach_grant WHERE id = ?", grantOf(access));
    assertThat(grant.get("kind")).isEqualTo("oauth");
    assertThat(grant.get("client_id")).isEqualTo(clientId);
    assertThat(grant.get("name")).isEqualTo("Harness " + run);
    assertThat(grant.get("user_id")).isEqualTo(user.getId());
    OffsetDateTime expires = OffsetDateTime.parse(String.valueOf(jdbc.queryForObject(
      "SELECT CAST(expires_at AS VARCHAR) FROM pianoml.coach_grant WHERE id = ?", String.class, grantOf(access))).replace(' ', 'T'));
    assertThat(expires).isBetween(OffsetDateTime.now().plusDays(364), OffsetDateTime.now().plusDays(366));

    assertThat(mcpStatus(access)).isEqualTo(200);
    com.fasterxml.jackson.databind.JsonNode context = new McpTestClient(mockMvc).data(access, "get_context", Map.of());
    assertThat(context.toString()).contains("Harness " + run);
  }

  @Test
  void theCodeExchange_refusesAnythingThatDiffersFromTheAuthorization() throws Exception {
    String code = code();
    record Case(String key, String value, String error) {
    }
    for (Case c : List.of(
      new Case("code_verifier", VERIFIER.replace('d', 'e'), "invalid_grant"),
      new Case("code_verifier", "short", "invalid_grant"),
      new Case("redirect_uri", "https://harness.example/other", "invalid_grant"),
      new Case("client_id", "pmc_00000000000000000000000000000000", "invalid_grant"),
      new Case("resource", "https://other.example/mcp", "invalid_target"),
      new Case("code", "not-a-code", "invalid_grant"),
      new Case("code_verifier", null, "invalid_request"),
      new Case("grant_type", "password", "unsupported_grant_type"),
      new Case("grant_type", null, "invalid_request"))) {
      Map<String, String> f = codeForm(code);
      f.put(c.key(), c.value());
      expectError(token(f), c.error());
    }
    // none of these used the code
    Map<String, String> noResource = codeForm(code);
    noResource.remove("resource");
    ok(token(noResource));
  }

  @Test
  void anExpiredCode_isRefused() throws Exception {
    String code = code();
    jdbc.update("UPDATE pianoml.coach_oauth_code SET expires_at = ? WHERE code_hash = ?",
      OffsetDateTime.now().minusSeconds(1), OAuthSecrets.hash(code));
    expectError(token(codeForm(code)), "invalid_grant");
  }

  @Test
  void aCodeUsedTwice_revokesWhatTheFirstUseProduced() throws Exception {
    String code = code();
    String access = ok(token(codeForm(code))).get("access_token").asString();
    assertThat(mcpStatus(access)).isEqualTo(200);
    expectError(token(codeForm(code)), "invalid_grant");
    assertThat(mcpStatus(access)).isEqualTo(401);
  }

  @Test
  void onlyFormEncodedBodies_noUrlParameters_noRepeats() throws Exception {
    mockMvc.perform(post("/oauth/token").contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(codeForm(code()))))
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_request"));
    mockMvc.perform(post("/oauth/token?grant_type=authorization_code").contentType(MediaType.APPLICATION_FORM_URLENCODED)
        .param("code", "x"))
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_request"));
    mockMvc.perform(post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
        .param("grant_type", "authorization_code", "refresh_token"))
      .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_request"));
  }

  // --- refresh ---------------------------------------------------------------------------------------------------

  @Test
  void refresh_returnsANewPair_andTheOldRefreshTokenDies() throws Exception {
    JsonNode first = ok(token(codeForm(code())));
    JsonNode second = ok(token(refreshForm(first.get("refresh_token").asString())));
    assertThat(second.get("access_token").asString()).isNotEqualTo(first.get("access_token").asString());
    assertThat(second.get("refresh_token").asString()).isNotEqualTo(first.get("refresh_token").asString());
    assertThat(mcpStatus(second.get("access_token").asString())).isEqualTo(200);
    JsonNode third = ok(token(refreshForm(second.get("refresh_token").asString())));
    assertThat(mcpStatus(third.get("access_token").asString())).isEqualTo(200);
  }

  @Test
  void aRefreshTokenUsedTwice_revokesTheGrant() throws Exception {
    JsonNode first = ok(token(codeForm(code())));
    JsonNode second = ok(token(refreshForm(first.get("refresh_token").asString())));
    expectError(token(refreshForm(first.get("refresh_token").asString())), "invalid_grant");
    assertThat(mcpStatus(second.get("access_token").asString())).isEqualTo(401);
    expectError(token(refreshForm(second.get("refresh_token").asString())), "invalid_grant");
  }

  @Test
  void refresh_refusesAnotherClient_anAccessToken_andAGrantPastItsYear() throws Exception {
    JsonNode first = ok(token(codeForm(code())));
    Map<String, String> otherClient = refreshForm(first.get("refresh_token").asString());
    otherClient.put("client_id", newClient("Other"));
    expectError(token(otherClient), "invalid_grant");
    expectError(token(refreshForm(first.get("access_token").asString())), "invalid_grant");

    // the grant's 365 days are over: no refresh brings it back
    jdbc.update("UPDATE pianoml.coach_grant SET expires_at = ? WHERE id = ?", OffsetDateTime.now().minusMinutes(1),
      grantOf(first.get("access_token").asString()));
    expectError(token(refreshForm(first.get("refresh_token").asString())), "invalid_grant");
  }

  @Test
  void tokensNeverOutliveTheGrant() throws Exception {
    JsonNode first = ok(token(codeForm(code())));
    UUID grantId = grantOf(first.get("access_token").asString());
    jdbc.update("UPDATE pianoml.coach_grant SET expires_at = ? WHERE id = ?", OffsetDateTime.now().plusMinutes(10), grantId);
    JsonNode second = ok(token(refreshForm(first.get("refresh_token").asString())));
    assertThat(second.get("expires_in").asLong()).isBetween(590L, 600L);
  }

  // --- on /mcp ---------------------------------------------------------------------------------------------------

  @Test
  void anAccessToken_isRefused_whenExpired_whenRevokedOnTheAccountPage_orForAnotherResource() throws Exception {
    String expired = ok(token(codeForm(code()))).get("access_token").asString();
    jdbc.update("UPDATE pianoml.coach_oauth_token SET expires_at = ? WHERE token_hash = ?",
      OffsetDateTime.now().minusSeconds(1), OAuthSecrets.hash(expired));
    assertThat(mcpStatus(expired)).isEqualTo(401);

    String otherAudience = ok(token(codeForm(code()))).get("access_token").asString();
    jdbc.update("UPDATE pianoml.coach_oauth_token SET resource = 'https://other.example/mcp' WHERE token_hash = ?",
      OAuthSecrets.hash(otherAudience));
    assertThat(mcpStatus(otherAudience)).isEqualTo(401);

    JsonNode pair = ok(token(codeForm(code())));
    String access = pair.get("access_token").asString();
    assertThat(mcpStatus(access)).isEqualTo(200);
    String xsrf = mockMvc.perform(get("/author/search/{q}", "x")).andReturn().getResponse().getHeaders("Set-Cookie")
      .stream().filter(h -> h.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow().split(";")[0].substring(11);
    mockMvc.perform(delete("/account/grants/{id}", grantOf(access)).cookie(session(user), new Cookie("XSRF-TOKEN", xsrf))
        .header("X-XSRF-TOKEN", xsrf))
      .andExpect(status().isNoContent());
    assertThat(mcpStatus(access)).isEqualTo(401);
    expectError(token(refreshForm(pair.get("refresh_token").asString())), "invalid_grant");
  }

  @Test
  void anAccessToken_authenticatesNothingOutsideMcp() throws Exception {
    String access = ok(token(codeForm(code()))).get("access_token").asString();
    mockMvc.perform(get("/account/userinfo").header("Authorization", "Bearer " + access)).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/account/grants").header("Authorization", "Bearer " + access)).andExpect(status().isUnauthorized());
  }

  // --- grants ----------------------------------------------------------------------------------------------------

  @Test
  void aNewConsentForTheSameClient_replacesThePreviousGrant() throws Exception {
    String first = ok(token(codeForm(code()))).get("access_token").asString();
    String second = ok(token(codeForm(code()))).get("access_token").asString();
    assertThat(mcpStatus(first)).isEqualTo(401);
    assertThat(mcpStatus(second)).isEqualTo(200);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_grant WHERE user_id = ? AND revoked_at IS NULL",
      Long.class, user.getId())).isEqualTo(1);
  }

  @Test
  void aSixthApplication_replacesTheLeastRecentlyUsed_andPersonalTokensAreUntouched() throws Exception {
    for (int i = 0; i < 5; i++) {
      grantService.create(user, "PAT " + i, List.of("practice:read"), 30);
    }
    List<String> accessTokens = new ArrayList<>();
    for (int i = 0; i < 6; i++) {
      String client = i == 0 ? clientId : newClient("App" + i);
      Map<String, String> f = codeForm(code(client, user, "scores:read"));
      f.put("client_id", client);
      accessTokens.add(ok(token(f)).get("access_token").asString());
    }
    assertThat(mcpStatus(accessTokens.get(0))).isEqualTo(401); // the oldest connection
    for (int i = 1; i < 6; i++) {
      assertThat(mcpStatus(accessTokens.get(i))).isEqualTo(200);
    }
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_grant WHERE user_id = ? AND kind = 'pat' AND revoked_at IS NULL",
      Long.class, user.getId())).isEqualTo(5);
  }

  @Test
  void personalTokenLimit_ignoresOAuthGrants() throws Exception {
    for (int i = 0; i < 3; i++) {
      grantService.createOAuth(user.getId(), "pmc_fake" + i + run, "App " + i, Set.of("scores:read"));
    }
    for (int i = 0; i < 5; i++) {
      grantService.create(user, "PAT " + i, List.of("practice:read"), 30);
    }
  }

  @Test
  void theAccountPage_listsOAuthGrants_withTheVouchingHost() throws Exception {
    grantService.createOAuth(user.getId(), "https://claude.ai/oauth/claude-metadata", "Claude", Set.of("scores:read"));
    ok(token(codeForm(code())));
    mockMvc.perform(get("/account/grants").cookie(session(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[?(@.name == 'Claude')].kind", hasItem("oauth")))
      .andExpect(jsonPath("$[?(@.name == 'Claude')].clientHost", hasItem("claude.ai")))
      .andExpect(jsonPath("$[?(@.name == 'Harness " + run + "')].kind", hasItem("oauth")));
  }

  @Test
  void aPersonalTokenShapedGuess_neverMatchesAnOAuthGrant() throws Exception {
    String access = ok(token(codeForm(code()))).get("access_token").asString();
    String grantHex = grantOf(access).toString().replace("-", "");
    assertThat(mcpStatus("pml_" + grantHex + "_" + "A".repeat(43))).isEqualTo(401);
  }

  // --- revocation ------------------------------------------------------------------------------------------------

  @Test
  void revokingAnAccessToken_endsIt_revokingARefreshToken_endsTheConnection() throws Exception {
    JsonNode pair = ok(token(codeForm(code())));
    String access = pair.get("access_token").asString();
    mockMvc.perform(post("/oauth/revoke").contentType(MediaType.APPLICATION_FORM_URLENCODED)
      .param("token", access).param("client_id", clientId)).andExpect(status().isOk());
    assertThat(mcpStatus(access)).isEqualTo(401);
    JsonNode next = ok(token(refreshForm(pair.get("refresh_token").asString())));
    assertThat(mcpStatus(next.get("access_token").asString())).isEqualTo(200);

    mockMvc.perform(post("/oauth/revoke").contentType(MediaType.APPLICATION_FORM_URLENCODED)
      .param("token", next.get("refresh_token").asString()).param("client_id", clientId)).andExpect(status().isOk());
    assertThat(mcpStatus(next.get("access_token").asString())).isEqualTo(401);
  }

  @Test
  void revocation_ignoresUnknownTokens_andTokensOfAnotherClient() throws Exception {
    String access = ok(token(codeForm(code()))).get("access_token").asString();
    mockMvc.perform(post("/oauth/revoke").contentType(MediaType.APPLICATION_FORM_URLENCODED)
      .param("token", "pmo_unknown").param("client_id", clientId)).andExpect(status().isOk());
    mockMvc.perform(post("/oauth/revoke").contentType(MediaType.APPLICATION_FORM_URLENCODED)
      .param("token", access).param("client_id", "pmc_someone_else")).andExpect(status().isOk());
    assertThat(mcpStatus(access)).isEqualTo(200);
  }

  @Test
  void theTokenEndpoint_isUsableFromAPageOnAnySite() throws Exception {
    mockMvc.perform(options("/oauth/token").header("Origin", "https://harness.example")
        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "content-type"))
      .andExpect(status().isOk())
      .andExpect(header().string("Access-Control-Allow-Origin", "*"))
      .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    token(codeForm(code())).andExpect(status().isOk());
  }
}
