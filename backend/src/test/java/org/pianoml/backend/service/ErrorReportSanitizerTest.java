package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.pianoml.backend.service.ErrorReportSanitizer.*;

class ErrorReportSanitizerTest {

  @Test
  void sanitizeUrlRemovesSensitiveParametersCredentialsAndFragment() {
    assertThat(sanitizeUrl("https://pianoml.org/account/verify?token=abc&lang=fr&Password=x&code=123&access_token=t#id_token=z"))
      .isEqualTo("https://pianoml.org/account/verify?lang=fr");
    assertThat(sanitizeUrl("https://bob:secret@pianoml.org/x;jsessionid=AB12?q=bach"))
      .isEqualTo("https://pianoml.org/x?q=bach");
    assertThat(sanitizeUrl("/score?reset%5Ftoken=1")).isEqualTo("/score");
    assertThat(sanitizeUrl("not a url ?? at all")).isEqualTo("not a url ?? at all");
    assertThat(sanitizeUrl("https://pianoml.org/" + "a".repeat(5000))).hasSize(MAX_URL);
  }

  @Test
  void normalizePathKeepsOnlyThePathWithIdsReplaced() {
    assertThat(normalizePath("https://api.pianoml.org/score/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed/page/12?x=1#y"))
      .isEqualTo("/score/{id}/page/{n}");
  }

  @Test
  void browserFingerprintIgnoresLineNumbersBundleHashesAndIds() {
    String stackA = """
      TypeError: x is undefined
          at render (https://pianoml.org/chunk-AB12CD34.js:1:2345)
          at main (https://pianoml.org/main-ZZ99YY88.js:3:10)""";
    String stackB = """
      TypeError: x is undefined
          at render (https://staging.pianoml.org/chunk-QQ77RR66.js:1:999)
          at main (https://staging.pianoml.org/main-AA11BB22.js:3:77)""";
    String a = fingerprint("TypeError", "x is undefined", stackA, "https://pianoml.org/score/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed");
    String b = fingerprint("TypeError", "x is undefined", stackB, "https://staging.pianoml.org/score/2c9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed?t=1");
    assertThat(a).isEqualTo(b).hasSize(64);
    assertThat(fingerprint("TypeError", "x is undefined", stackA, "https://pianoml.org/library")).isNotEqualTo(a);
  }

  @Test
  void browserFingerprintWithoutStackUsesTheMessage() {
    assertThat(fingerprint(null, "Request 42 failed", null, "/a"))
      .isEqualTo(fingerprint(null, "Request 7 failed", "", "/a"))
      .isNotEqualTo(fingerprint(null, "Socket closed", null, "/a"));
  }

  @Test
  void backendFingerprintUsesTheRootCauseAndThePath() {
    RuntimeException one = new RuntimeException("wrapper", new IllegalStateException("boom 1"));
    RuntimeException two = new RuntimeException("other wrapper", new IllegalStateException("boom 2"));
    two.getCause().setStackTrace(one.getCause().getStackTrace());
    assertThat(fingerprint(one, "http://localhost/score/1")).isEqualTo(fingerprint(two, "http://localhost/score/2"));
    assertThat(fingerprint(one, "http://localhost/author/1")).isNotEqualTo(fingerprint(one, "http://localhost/score/1"));
  }
}
