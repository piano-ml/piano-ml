package org.pianoml.backend.security;

import org.springframework.security.core.Authentication;

public class SecurityUtils {

  public static boolean isAdmin(Authentication authentication) {
    return authentication.getAuthorities().stream().anyMatch(auth -> auth.getAuthority().equals("ROLE_ADMIN"));
  }
}
