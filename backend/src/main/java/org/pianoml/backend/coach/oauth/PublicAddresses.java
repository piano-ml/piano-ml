package org.pianoml.backend.coach.oauth;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * Which addresses the server may fetch a client metadata document from (coach, issue #414; SSRF guard of
 * docs/coach-oauth-design.md 2.2): public unicast addresses only. Refused: loopback, private and carrier-grade
 * NAT ranges, link-local (cloud metadata endpoints live there), multicast, reserved, documentation and
 * benchmarking ranges, IPv6 unique-local, and IPv6 forms that embed a refused IPv4 address.
 */
public final class PublicAddresses {

  private PublicAddresses() {
  }

  public static boolean isPublic(InetAddress address) {
    if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
      || address.isSiteLocalAddress() || address.isMulticastAddress()) {
      return false;
    }
    if (address instanceof Inet4Address) {
      return isPublicV4(address.getAddress());
    }
    if (address instanceof Inet6Address) {
      return isPublicV6(address.getAddress());
    }
    return false;
  }

  private static boolean isPublicV4(byte[] b) {
    int a0 = b[0] & 0xff;
    int a1 = b[1] & 0xff;
    int a2 = b[2] & 0xff;
    return !(a0 == 0                                   // 0.0.0.0/8 "this network"
      || a0 == 10                                      // 10/8
      || (a0 == 100 && a1 >= 64 && a1 <= 127)          // 100.64/10 carrier-grade NAT
      || a0 == 127                                     // loopback
      || (a0 == 169 && a1 == 254)                      // link-local, cloud metadata
      || (a0 == 172 && a1 >= 16 && a1 <= 31)           // 172.16/12
      || (a0 == 192 && a1 == 0 && (a2 == 0 || a2 == 2))   // 192.0.0/24 IETF, 192.0.2/24 documentation
      || (a0 == 192 && a1 == 88 && a2 == 99)           // 6to4 relay anycast
      || (a0 == 192 && a1 == 168)                      // 192.168/16
      || (a0 == 198 && (a1 == 18 || a1 == 19))         // 198.18/15 benchmarking
      || (a0 == 198 && a1 == 51 && a2 == 100)          // documentation
      || (a0 == 203 && a1 == 0 && a2 == 113)           // documentation
      || a0 >= 224);                                   // multicast, reserved, broadcast
  }

  private static boolean isPublicV6(byte[] b) {
    int first = ((b[0] & 0xff) << 8) | (b[1] & 0xff);
    int second = ((b[2] & 0xff) << 8) | (b[3] & 0xff);
    if ((b[0] & 0xfe) == 0xfc) {
      return false; // fc00::/7 unique local
    }
    if ((first & 0xffc0) == 0xfec0) {
      return false; // fec0::/10 deprecated site-local
    }
    if (first == 0x2001 && second == 0x0db8) {
      return false; // documentation
    }
    if (first == 0x2001 && second == 0x0000) {
      return false; // Teredo: the IPv4 inside cannot be checked reliably
    }
    if (first == 0x2002) {
      return embeddedV4IsPublic(b, 2); // 6to4
    }
    if (first == 0x0064 && second == 0xff9b) {
      return embeddedV4IsPublic(b, 12); // NAT64 well-known prefix
    }
    boolean zeroPrefix = true;
    for (int i = 0; i < 10; i++) {
      zeroPrefix &= b[i] == 0;
    }
    if (zeroPrefix && (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff) {
      return embeddedV4IsPublic(b, 12); // IPv4-mapped
    }
    if (zeroPrefix && b[10] == 0 && b[11] == 0) {
      return false; // ::/96: unspecified, loopback, deprecated IPv4-compatible
    }
    return (first & 0xe000) == 0x2000; // only global unicast 2000::/3
  }

  private static boolean embeddedV4IsPublic(byte[] b, int offset) {
    try {
      return isPublic(InetAddress.getByAddress(new byte[]{b[offset], b[offset + 1], b[offset + 2], b[offset + 3]}));
    } catch (UnknownHostException e) {
      return false;
    }
  }
}
