package org.pianoml.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Access grants for external tools (coach, issue #414, phase 1): the /account/grants routes, the token-only
 * /mcp/** chain, and the guarantee that a grant token never acts as a browser session (and the reverse).
 */
@SpringBootTest
@AutoConfigureMockMvc
class CoachGrantTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;
  @Autowired private CoachGrantService coachGrantService;

  private final ObjectMapper json = new ObjectMapper();

  /** An MCP tools/list request: it needs nothing but a valid grant. */
  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder mcpRequest(String authorization) {
    var request = post("/mcp").contentType(MediaType.APPLICATION_JSON)
      .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
      .content("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}");
    if (authorization != null) {
      request.header("Authorization", authorization);
    }
    return request;
  }

  private org.springframework.test.web.servlet.ResultActions mcp(String authorization) throws Exception {
    return mockMvc.perform(mcpRequest(authorization));
  }
  private final List<UUID> createdUsers = new ArrayList<>();

  @AfterEach
  void cleanup() {
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.coach_grant WHERE user_id = ?", userId);
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", userId);
    }
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("pianist-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    createdUsers.add(saved.getId());
    return saved;
  }

  /**
   * A real XSRF-TOKEN cookie and its X-XSRF-TOKEN header, as the SPA sends them. Not
   * SecurityMockMvcRequestPostProcessors.csrf(): it swaps the CSRF repository in the shared test context, and
   * tests that rely on the real XSRF-TOKEN cookie then fail (see CsrfProtectionTest).
   */
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

  private Cookie session(User user) {
    return new Cookie("Authorization", jwtTokenProvider.generateToken(user));
  }

  /** Creates a grant through the API (cookie session + CSRF) and returns the response body. */
  private JsonNode createGrant(User user, String name, List<String> scopes) throws Exception {
    String body = mockMvc.perform(post("/account/grants").with(xsrf()).cookie(session(user))
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(Map.of("name", name, "scopes", scopes))))
      .andExpect(status().isCreated())
      .andReturn().getResponse().getContentAsString();
    return json.readTree(body);
  }

  private String token(User user) throws Exception {
    return createGrant(user, "Test host", List.of("practice:read", "scores:read")).get("token").asText();
  }

  private UUID grantId(String token) {
    String hex = token.substring(4, 36);
    return UUID.fromString(hex.replaceFirst("(.{8})(.{4})(.{4})(.{4})(.{12})", "$1-$2-$3-$4-$5"));
  }

  // --- creation and listing --------------------------------------------------------------------------------------

  @Test
  void create_returnsTheTokenOnce_andNeverStoresOrListsTheSecret() throws Exception {
    User user = newUser();
    JsonNode created = createGrant(user, "  Claude Code on my laptop  ", List.of("scores:read", "practice:read"));

    String token = created.get("token").asText();
    assertThat(token).matches("pml_[0-9a-f]{32}_[A-Za-z0-9_-]{43}");
    assertThat(created.get("name").asText()).isEqualTo("Claude Code on my laptop");
    assertThat(created.get("kind").asText()).isEqualTo("pat");
    assertThat(grantId(token).toString()).isEqualTo(created.get("id").asText());

    String listed = mockMvc.perform(get("/account/grants").cookie(session(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$", hasSize(1)))
      .andExpect(jsonPath("$[0].scopes", contains("practice:read", "scores:read")))
      .andExpect(jsonPath("$[0].token").doesNotExist())
      .andReturn().getResponse().getContentAsString();
    String secret = token.substring(37);
    assertThat(listed).doesNotContain(secret);

    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM pianoml.coach_grant WHERE user_id = ?", user.getId());
    assertThat(row.values().stream().map(String::valueOf)).noneMatch(value -> value.contains(secret));
    assertThat(String.valueOf(row.get("secret_hash")).trim()).matches("[0-9a-f]{64}");
  }

  @Test
  void create_defaultsToNinetyDays() throws Exception {
    User user = newUser();
    createGrant(user, "host", List.of("practice:read"));
    Map<String, Object> row = jdbc.queryForMap(
      "SELECT DATEDIFF('DAY', created_at, expires_at) AS days FROM pianoml.coach_grant WHERE user_id = ?", user.getId());
    assertThat(((Number) row.get("days")).intValue()).isEqualTo(90);
  }

  @Test
  void create_rejectsInvalidInput() throws Exception {
    User user = newUser();
    for (String body : List.of(
      "{\"name\":\"   \",\"scopes\":[\"practice:read\"]}",
      "{\"name\":\"" + "x".repeat(81) + "\",\"scopes\":[\"practice:read\"]}",
      "{\"name\":\"host\",\"scopes\":[]}",
      "{\"name\":\"host\",\"scopes\":[\"admin\"]}",
      "{\"name\":\"host\",\"scopes\":[\"practice:read\"],\"expiresInDays\":0}",
      "{\"name\":\"host\",\"scopes\":[\"practice:read\"],\"expiresInDays\":366}")) {
      mockMvc.perform(post("/account/grants").with(xsrf()).cookie(session(user))
          .contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isBadRequest());
    }
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_grant WHERE user_id = ?", Integer.class, user.getId()))
      .isZero();
  }

  @Test
  void sixthLiveGrant_isRefused_untilOneIsRevoked() throws Exception {
    User user = newUser();
    String first = null;
    for (int i = 0; i < CoachGrantService.MAX_LIVE_GRANTS; i++) {
      String token = token(user);
      first = first == null ? token : first;
    }
    mockMvc.perform(post("/account/grants").with(xsrf()).cookie(session(user))
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"one too many\",\"scopes\":[\"practice:read\"]}"))
      .andExpect(status().isConflict());

    mockMvc.perform(delete("/account/grants/" + grantId(first)).with(xsrf()).cookie(session(user)))
      .andExpect(status().isNoContent());
    token(user);
  }

  @Test
  void creations_areRateLimitedPerUser() throws Exception {
    User user = newUser();
    for (int i = 0; i < 10; i++) {
      String token = token(user);
      mockMvc.perform(delete("/account/grants/" + grantId(token)).with(xsrf()).cookie(session(user)))
        .andExpect(status().isNoContent());
    }
    mockMvc.perform(post("/account/grants").with(xsrf()).cookie(session(user))
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"eleventh\",\"scopes\":[\"practice:read\"]}"))
      .andExpect(status().isTooManyRequests());
    // Another user is not affected
    token(newUser());
  }

  // --- access to the routes -------------------------------------------------------------------------------------

  @Test
  void anonymous_isRefusedOnEveryGrantRoute() throws Exception {
    mockMvc.perform(get("/account/grants")).andExpect(status().isUnauthorized());
    mockMvc.perform(post("/account/grants").with(xsrf()).contentType(MediaType.APPLICATION_JSON)
        .content("{\"name\":\"host\",\"scopes\":[\"practice:read\"]}"))
      .andExpect(status().isUnauthorized());
    mockMvc.perform(delete("/account/grants/" + UUID.randomUUID()).with(xsrf())).andExpect(status().isUnauthorized());
  }

  @Test
  void anotherUsersGrant_isNotFound_andStaysValid() throws Exception {
    User owner = newUser();
    String token = token(owner);
    User other = newUser();

    mockMvc.perform(delete("/account/grants/" + grantId(token)).with(xsrf()).cookie(session(other)))
      .andExpect(status().isNotFound());
    mockMvc.perform(get("/account/grants").cookie(session(other))).andExpect(jsonPath("$", hasSize(0)));
    mcp("Bearer " + token).andExpect(status().isOk());
  }

  @Test
  void createAndRevoke_needTheCsrfToken() throws Exception {
    User user = newUser();
    mockMvc.perform(post("/account/grants").cookie(session(user)).contentType(MediaType.APPLICATION_JSON)
        .content("{\"name\":\"host\",\"scopes\":[\"practice:read\"]}"))
      .andExpect(status().isForbidden());
    String token = token(user);
    mockMvc.perform(delete("/account/grants/" + grantId(token)).cookie(session(user)))
      .andExpect(status().isForbidden());
  }

  // --- the /mcp chain ---------------------------------------------------------------------------------------------

  @Test
  void validToken_authenticatesOnMcp_withItsNameAndScopes_andRecordsTheUse() throws Exception {
    User user = newUser();
    String token = token(user);

    JsonNode context = new McpTestClient(mockMvc).data(token, "get_context", Map.of());
    assertThat(context.path("grant").path("name").asText()).isEqualTo("Test host");
    assertThat(context.path("grant").path("scopes").toString()).isEqualTo("[\"practice:read\",\"scores:read\"]");
    assertThat(context.path("user").path("name").asText()).isEqualTo(user.getName());

    assertThat(jdbc.queryForObject("SELECT last_used_at FROM pianoml.coach_grant WHERE id = ?", Object.class, grantId(token)))
      .isNotNull();
  }

  @Test
  void mcp_refusesEverythingButAValidLiveGrantToken() throws Exception {
    User user = newUser();
    String token = token(user);
    String wrongSecret = token.substring(0, 37) + (token.charAt(37) == 'A' ? 'B' : 'A') + token.substring(38);

    mcp(null).andExpect(status().isUnauthorized());
    mcp("Bearer " + wrongSecret).andExpect(status().isUnauthorized());
    mcp(token).andExpect(status().isUnauthorized());
    mcp("Bearer pml_" + UUID.randomUUID().toString().replace("-", "") + "_" + "A".repeat(43))
      .andExpect(status().isUnauthorized());
    // A browser session never reaches /mcp, neither as a bearer header nor as the cookie
    mcp("Bearer " + jwtTokenProvider.generateToken(user))
      .andExpect(status().isUnauthorized());
    mockMvc.perform(mcpRequest(null).cookie(session(user))).andExpect(status().isUnauthorized());
    // Nor does the grant token in the cookie
    mockMvc.perform(mcpRequest(null).cookie(new Cookie("Authorization", token))).andExpect(status().isUnauthorized());
  }

  @Test
  void expiredOrRevokedGrant_isRefusedImmediately() throws Exception {
    User user = newUser();
    String expired = token(user);
    jdbc.update("UPDATE pianoml.coach_grant SET expires_at = DATEADD('SECOND', -1, CURRENT_TIMESTAMP) WHERE id = ?",
      grantId(expired));
    mcp("Bearer " + expired).andExpect(status().isUnauthorized());

    String revoked = token(user);
    mcp("Bearer " + revoked).andExpect(status().isOk());
    mockMvc.perform(delete("/account/grants/" + grantId(revoked)).with(xsrf()).cookie(session(user)))
      .andExpect(status().isNoContent());
    mcp("Bearer " + revoked).andExpect(status().isUnauthorized());
  }

  @Test
  void revokeAll_cutsEveryTokenOfTheUser() throws Exception {
    User user = newUser();
    String a = token(user);
    String b = token(user);
    String otherUsers = token(newUser());

    assertThat(coachGrantService.revokeAll(user.getId())).isEqualTo(2);

    mcp("Bearer " + a).andExpect(status().isUnauthorized());
    mcp("Bearer " + b).andExpect(status().isUnauthorized());
    mcp("Bearer " + otherUsers).andExpect(status().isOk());
  }

  @Test
  void aValidToken_works_fromAPageOnAnySite() throws Exception {
    // Clients can run anywhere, a web page included (docs/coach-oauth-design.md 2.6): no ambient credential here
    String token = token(newUser());
    for (String origin : List.of("https://www.pianoml.org", "https://harness.example", "http://localhost:6274")) {
      mockMvc.perform(mcpRequest("Bearer " + token).header("Origin", origin))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "*"))
        .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    }
  }

  @Test
  void whileOAuthIsOff_theChallengePointsNowhere_andNoOAuthEndpointAnswers() throws Exception {
    mcp(null).andExpect(status().isUnauthorized())
      .andExpect(header().string("WWW-Authenticate", "Bearer realm=\"PianoML\""));
    mcp("Bearer pml_nope").andExpect(status().isUnauthorized())
      .andExpect(header().string("WWW-Authenticate", "Bearer realm=\"PianoML\", error=\"invalid_token\""));
    mockMvc.perform(get("/.well-known/oauth-protected-resource/mcp")).andExpect(status().isNotFound());
    mockMvc.perform(get("/.well-known/oauth-authorization-server")).andExpect(status().isNotFound());
    mockMvc.perform(post("/oauth/register").contentType(MediaType.APPLICATION_JSON)
        .content("{\"redirect_uris\":[\"https://harness.example/cb\"]}"))
      .andExpect(status().isNotFound());
  }

  // --- the main chain ignores grant tokens ------------------------------------------------------------------------

  @Test
  void grantToken_authenticatesNothingOutsideMcp() throws Exception {
    User user = newUser();
    String token = token(user);
    String session = """
      {"kind":"exercise","exerciseType":"scale","patternKey":"major","exerciseKey":"intervals","tonic":"C",
       "startedAt":"2026-11-16T10:00:00Z","endedAt":"2026-11-16T10:05:00Z","activeSeconds":120}""";

    mockMvc.perform(get("/account/userinfo").header("Authorization", "Bearer " + token))
      .andExpect(status().isUnauthorized());
    mockMvc.perform(get("/account/userinfo").cookie(new Cookie("Authorization", token)))
      .andExpect(status().isUnauthorized());
    mockMvc.perform(get("/account/grants").header("Authorization", "Bearer " + token))
      .andExpect(status().isUnauthorized());
    // The Authorization header turns CSRF off on the main chain: the request must still be anonymous
    mockMvc.perform(put("/practice/session/" + UUID.randomUUID()).header("Authorization", "Bearer " + token)
        .contentType(MediaType.APPLICATION_JSON).content(session))
      .andExpect(status().isUnauthorized());
    mockMvc.perform(post("/account/grants").header("Authorization", "Bearer " + token)
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"escalation\",\"scopes\":[\"practice:read\"]}"))
      .andExpect(status().isUnauthorized());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.practice_session WHERE user_id = ?", Integer.class, user.getId()))
      .isZero();
  }

  @Test
  void accountDeletion_deletesTheGrants_andTheirTokensStopWorking() throws Exception {
    User user = newUser();
    String token = token(user);

    mockMvc.perform(post("/account/delete").with(xsrf()).cookie(session(user))).andExpect(status().isNoContent());

    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_grant WHERE user_id = ?", Integer.class, user.getId()))
      .isZero();
    mcp("Bearer " + token).andExpect(status().isUnauthorized());
  }

  @Test
  void purgeStale_deletesGrantsExpiredOrRevokedMoreThanThirtyDaysAgo() throws Exception {
    User user = newUser();
    UUID oldExpired = grantId(token(user));
    UUID oldRevoked = grantId(token(user));
    UUID recentRevoked = grantId(token(user));
    UUID live = grantId(token(user));
    jdbc.update("UPDATE pianoml.coach_grant SET expires_at = DATEADD('DAY', -31, CURRENT_TIMESTAMP) WHERE id = ?", oldExpired);
    jdbc.update("UPDATE pianoml.coach_grant SET revoked_at = DATEADD('DAY', -31, CURRENT_TIMESTAMP) WHERE id = ?", oldRevoked);
    jdbc.update("UPDATE pianoml.coach_grant SET revoked_at = DATEADD('DAY', -2, CURRENT_TIMESTAMP) WHERE id = ?", recentRevoked);

    coachGrantService.purgeStale();

    List<String> left = jdbc.queryForList("SELECT CAST(id AS VARCHAR) FROM pianoml.coach_grant WHERE user_id = ?",
      String.class, user.getId());
    assertThat(left).containsExactlyInAnyOrder(recentRevoked.toString(), live.toString());
  }
}
