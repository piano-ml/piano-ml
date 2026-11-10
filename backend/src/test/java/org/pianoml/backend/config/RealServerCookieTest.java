package org.pianoml.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Same requests as a browser on pianoml.org, against a real embedded Tomcat. MockMvc does not run Tomcat's
 * cookie validation: a Domain of ".pianoml.org" passed every MockMvc test but made Tomcat throw, so every request
 * from a pianoml.org origin answered 500 in production.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RealServerCookieTest {

  @LocalServerPort
  private int port;

  private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
    return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private HttpRequest.Builder request(String path) {
    return HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
  }

  @Test
  void getFromPianomlOrigin_succeeds_andSharesTheXsrfCookieWithSubdomains() throws Exception {
    for (String origin : List.of("https://pianoml.org", "https://www.pianoml.org", "https://staging.pianoml.org")) {
      HttpResponse<String> response = send(request("/genre").header("Origin", origin).GET());

      assertThat(response.statusCode()).as(origin).isEqualTo(200);
      assertThat(response.headers().allValues("Set-Cookie")).as(origin)
        .anyMatch(c -> c.startsWith("XSRF-TOKEN=") && c.contains("Domain=pianoml.org"));
    }
  }

  @Test
  void loginFromPianomlOrigin_answersNormally() throws Exception {
    HttpResponse<String> response = send(request("/account/login")
      .header("Origin", "https://pianoml.org")
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"nobody@example.com\",\"password\":\"x\"}")));

    assertThat(response.statusCode()).isEqualTo(403); // bad credentials, not a 500
    assertThat(response.body()).contains("BadCredentialsException");
  }

  @Test
  void getWithoutOrigin_setsAHostOnlyXsrfCookie() throws Exception {
    HttpResponse<String> response = send(request("/genre").GET());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().allValues("Set-Cookie"))
      .anyMatch(c -> c.startsWith("XSRF-TOKEN=") && !c.contains("Domain="));
  }
}
