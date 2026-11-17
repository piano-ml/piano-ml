package org.pianoml.backend.coach.oauth;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.InetAddress;

import static org.assertj.core.api.Assertions.assertThat;

class PublicAddressesTest {

  @ParameterizedTest
  @ValueSource(strings = {
    "0.0.0.0", "0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.254", "127.0.0.1", "127.8.9.10",
    "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1", "192.88.99.1", "192.168.1.1",
    "198.18.0.1", "198.19.255.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.1.1.1", "240.0.0.1",
    "255.255.255.255",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "fec0::1", "ff02::1", "2001:db8::1", "2001:0:4136:e378::1",
    "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:169.254.169.254", "2002:7f00:1::1", "2002:c0a8:101::1",
    "64:ff9b::a9fe:a9fe", "::127.0.0.1", "100::1"
  })
  void refused(String address) throws Exception {
    assertThat(PublicAddresses.isPublic(InetAddress.getByName(address))).as(address).isFalse();
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "8.8.8.8", "1.1.1.1", "160.79.104.10", "100.63.255.255", "100.128.0.1", "172.15.255.255", "172.32.0.1",
    "192.169.0.1", "223.255.255.254",
    "2606:4700:4700::1111", "2a00:1450:4007:80e::200e", "::ffff:8.8.8.8", "2002:808:808::1", "64:ff9b::808:808"
  })
  void allowed(String address) throws Exception {
    assertThat(PublicAddresses.isPublic(InetAddress.getByName(address))).as(address).isTrue();
  }
}
