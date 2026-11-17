package org.pianoml.backend.coach.oauth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ClientAddressResolverTest {

  private static MockHttpServletRequest request(String peer, String... forwardedFor) {
    MockHttpServletRequest r = new MockHttpServletRequest();
    r.setRemoteAddr(peer);
    for (String header : forwardedFor) {
      r.addHeader("X-Forwarded-For", header);
    }
    return r;
  }

  @Test
  void withoutTrustedProxies_theHeaderIsIgnored_anyoneCouldSendIt() {
    assertThat(new ClientAddressResolver(0).resolve(request("198.51.100.1", "203.0.113.9"))).isEqualTo("198.51.100.1");
  }

  @Test
  void behindOneProxy_theClientIsTheLastEntry_whatTheClientPrependsIsIgnored() {
    ClientAddressResolver resolver = new ClientAddressResolver(1);
    assertThat(resolver.resolve(request("169.254.1.1", "203.0.113.9"))).isEqualTo("203.0.113.9");
    assertThat(resolver.resolve(request("169.254.1.1", "1.2.3.4, 203.0.113.9"))).isEqualTo("203.0.113.9");
    assertThat(resolver.resolve(request("169.254.1.1", "5.6.7.8", "203.0.113.9"))).isEqualTo("203.0.113.9");
    assertThat(resolver.resolve(request("169.254.1.1", "2001:db8::7"))).isEqualTo("2001:db8::7");
  }

  @Test
  void behindTwoProxies_theClientIsSecondFromTheRight() {
    ClientAddressResolver resolver = new ClientAddressResolver(2);
    assertThat(resolver.resolve(request("10.0.0.2", "1.2.3.4, 203.0.113.9, 130.211.0.5"))).isEqualTo("203.0.113.9");
  }

  @Test
  void aMissingShortOrMalformedHeader_fallsBackToThePeer() {
    assertThat(new ClientAddressResolver(1).resolve(request("169.254.1.1"))).isEqualTo("169.254.1.1");
    assertThat(new ClientAddressResolver(2).resolve(request("169.254.1.1", "203.0.113.9"))).isEqualTo("169.254.1.1");
    assertThat(new ClientAddressResolver(1).resolve(request("169.254.1.1", "evil<script>"))).isEqualTo("169.254.1.1");
    assertThat(new ClientAddressResolver(1).resolve(request("169.254.1.1", " , "))).isEqualTo("169.254.1.1");
  }
}
