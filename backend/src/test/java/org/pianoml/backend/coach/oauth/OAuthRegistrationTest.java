package org.pianoml.backend.coach.oauth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Dynamic client registration (coach, issue #414, phase O2; docs/coach-oauth-design.md 2.2). */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"coach.oauth.enabled=true", "coach.oauth.register.per-ip-per-hour=5"})
class OAuthRegistrationTest {

  private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;

  private final ObjectMapper json = new ObjectMapper();
  private final String run = UUID.randomUUID().toString().substring(0, 8);

  @AfterEach
  void cleanup() {
    jdbc.update("DELETE FROM pianoml.coach_oauth_client WHERE client_name LIKE ?", "%" + run + "%");
  }

  /** A fresh documentation address per call, so that tests do not share the per-address limit. */
  private static String freshIp() {
    int n = NEXT_IP.getAndIncrement();
    return "198.51.100." + (n % 250 + 1) + "";
  }

  private ResultActions register(Object body, String ip) throws Exception {
    return mockMvc.perform(post("/oauth/register")
      .with(r -> {
        r.setRemoteAddr(ip);
        return r;
      })
      .contentType(MediaType.APPLICATION_JSON)
      .content(body instanceof String s ? s : json.writeValueAsString(body)));
  }

  private ResultActions register(Object body) throws Exception {
    return register(body, freshIp()); // never the address of the rate-limit test
  }

  private Map<String, Object> request(Object redirectUris) {
    Map<String, Object> body = new HashMap<>();
    body.put("client_name", "Harness " + run);
    body.put("redirect_uris", redirectUris);
    body.put("token_endpoint_auth_method", "none");
    body.put("grant_types", List.of("authorization_code", "refresh_token"));
    body.put("response_types", List.of("code"));
    return body;
  }

  @Test
  void aPublicClient_isRegistered_withHttpsOnAnyHost_orLoopback() throws Exception {
    String body = register(request(List.of("https://harness.example/callback", "http://127.0.0.1/callback")))
      .andExpect(status().isCreated())
      .andExpect(header().string("Cache-Control", "no-store"))
      .andExpect(jsonPath("$.client_id").value(startsWith("pmc_")))
      .andExpect(jsonPath("$.client_name").value("Harness " + run))
      .andExpect(jsonPath("$.redirect_uris", contains("https://harness.example/callback", "http://127.0.0.1/callback")))
      .andExpect(jsonPath("$.token_endpoint_auth_method").value("none"))
      .andExpect(jsonPath("$.grant_types", contains("authorization_code", "refresh_token")))
      .andExpect(jsonPath("$.response_types", contains("code")))
      .andExpect(jsonPath("$.client_secret").doesNotExist())
      .andReturn().getResponse().getContentAsString();
    String clientId = json.readTree(body).get("client_id").asString();
    assertThat(clientId).matches("pmc_[0-9a-f]{32}");
    assertThat(jdbc.queryForObject("SELECT kind FROM pianoml.coach_oauth_client WHERE client_id = ?", String.class, clientId))
      .isEqualTo("dcr");
  }

  @Test
  void minimalRequest_getsTheDefaults_asAPublicClient() throws Exception {
    register(Map.of("client_name", "Minimal " + run, "redirect_uris", List.of("http://localhost/cb")))
      .andExpect(status().isCreated())
      .andExpect(jsonPath("$.token_endpoint_auth_method").value("none"));
  }

  @Test
  void badRegistrations_areRefused_withTheRfcErrorCode() throws Exception {
    record Case(Map<String, Object> body, String error) {
    }
    Map<String, Object> confidential = request(List.of("https://harness.example/cb"));
    confidential.put("token_endpoint_auth_method", "client_secret_basic");
    Map<String, Object> clientCredentials = request(List.of("https://harness.example/cb"));
    clientCredentials.put("grant_types", List.of("client_credentials"));
    Map<String, Object> implicit = request(List.of("https://harness.example/cb"));
    implicit.put("response_types", List.of("token"));
    Map<String, Object> longName = request(List.of("https://harness.example/cb"));
    longName.put("client_name", "x".repeat(81) + run);
    Map<String, Object> noRedirect = request(List.of("https://harness.example/cb"));
    noRedirect.remove("redirect_uris");
    for (Case c : List.of(
      new Case(confidential, "invalid_client_metadata"),
      new Case(clientCredentials, "invalid_client_metadata"),
      new Case(implicit, "invalid_client_metadata"),
      new Case(longName, "invalid_client_metadata"),
      new Case(noRedirect, "invalid_redirect_uri"),
      new Case(request(List.of()), "invalid_redirect_uri"),
      new Case(request(List.of("http://harness.example/cb")), "invalid_redirect_uri"),
      new Case(request(List.of("myapp://cb")), "invalid_redirect_uri"),
      new Case(request(List.of("https://harness.example/cb#x")), "invalid_redirect_uri"),
      new Case(request(List.of("https://a.example/1", "https://a.example/2", "https://a.example/3",
        "https://a.example/4", "https://a.example/5", "https://a.example/6")), "invalid_redirect_uri"))) {
      register(c.body()).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value(c.error()));
    }
    register("not json").andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_client_metadata"));
    register("{\"client_name\":\"" + "x".repeat(17_000) + "\"}").andExpect(status().isBadRequest());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.coach_oauth_client WHERE client_name LIKE ?",
      Long.class, "%" + run + "%")).isZero();
  }

  @Test
  void registrations_areLimitedPerAddress() throws Exception {
    String ip = "203.0.113.77";
    for (int i = 0; i < 5; i++) {
      register(request(List.of("https://harness.example/cb")), ip).andExpect(status().isCreated());
    }
    register(request(List.of("https://harness.example/cb")), ip)
      .andExpect(status().isTooManyRequests())
      .andExpect(jsonPath("$.error").value("temporarily_unavailable"));
    register(request(List.of("https://harness.example/cb")), "203.0.113.78").andExpect(status().isCreated());
  }

  @Test
  void worksFromAPageOnAnySite_withoutCsrf_andIgnoresCookies() throws Exception {
    mockMvc.perform(options("/oauth/register")
        .header("Origin", "https://harness.example")
        .header("Access-Control-Request-Method", "POST")
        .header("Access-Control-Request-Headers", "content-type"))
      .andExpect(status().isOk())
      .andExpect(header().string("Access-Control-Allow-Origin", "*"))
      .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    mockMvc.perform(post("/oauth/register")
        .with(r -> {
          r.setRemoteAddr(freshIp());
          return r;
        })
        .header("Origin", "https://harness.example")
        .cookie(new Cookie("Authorization", "whatever"))
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(request(List.of("https://harness.example/cb")))))
      .andExpect(status().isCreated())
      .andExpect(header().string("Access-Control-Allow-Origin", "*"))
      .andExpect(header().doesNotExist("Set-Cookie"));
  }

  @Test
  void onlyJsonIsAccepted() throws Exception {
    mockMvc.perform(post("/oauth/register")
        .with(r -> {
          r.setRemoteAddr(freshIp());
          return r;
        })
        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
        .content("client_name=x&redirect_uris=https://harness.example/cb"))
      .andExpect(status().isBadRequest());
  }
}
