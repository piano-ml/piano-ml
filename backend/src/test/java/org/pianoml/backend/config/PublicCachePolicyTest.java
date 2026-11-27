package org.pianoml.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.CacheControl;

import static org.assertj.core.api.Assertions.assertThat;

class PublicCachePolicyTest {

  private static String header(String method, String path) {
    return PublicCachePolicy.cacheControl(method, path).map(CacheControl::getHeaderValue).orElse(null);
  }

  @Test
  void scoresAndTheirVideosAreRevalidatedOnEveryUse() {
    assertThat(header("GET", "/score/azali-chaos-construct")).isEqualTo("max-age=0, must-revalidate, public");
    assertThat(header("GET", "/score/17355e0e-20f3-492a-9ecf-3bf86629e4d1/video")).isEqualTo("max-age=0, must-revalidate, public");
  }

  @Test
  void slowChangingListsAreKeptFiveMinutes() {
    assertThat(header("GET", "/genre")).isEqualTo("max-age=300, public");
    assertThat(header("GET", "/score/stats")).isEqualTo("max-age=300, public");
    assertThat(header("GET", "/score/getFullKey")).isEqualTo("max-age=300, public");
  }

  @Test
  void userDependentAndOtherEndpointsAreNotPublic() {
    assertThat(header("GET", "/score/search")).isNull();
    assertThat(header("GET", "/score/genre/browse")).isNull();
    assertThat(header("GET", "/score/author/browse")).isNull();
    assertThat(header("GET", "/score/abc/info")).isNull();
    assertThat(header("GET", "/score/owner/abc/midi/1/2")).isNull();
    assertThat(header("GET", "/genre/abc")).isNull();
    assertThat(header("GET", "/account/userinfo")).isNull();
  }

  @Test
  void onlyGet() {
    assertThat(header("PUT", "/score/azali-chaos-construct")).isNull();
    assertThat(header("POST", "/genre")).isNull();
  }
}
