package org.pianoml.backend.security;

import java.security.Principal;
import java.util.Set;
import java.util.UUID;

/**
 * Who calls /mcp/**: the user a grant acts for, the grant, the client name the user gave it, and its scopes
 * (coach, issue #414). {@link #getName()} is the user id, like the principal of a browser session, so code that
 * reads {@code authentication.getName()} gets the same user.
 */
public record GrantPrincipal(UUID userId, UUID grantId, String clientName, Set<String> scopes) implements Principal {

  /**
   * Request attribute holding the authenticated grant. MCP tool handlers run on another thread, where the
   * security context is empty: they get the grant from the request through this attribute.
   */
  public static final String REQUEST_ATTRIBUTE = GrantPrincipal.class.getName();

  @Override
  public String getName() {
    return userId.toString();
  }

  public boolean hasScope(String scope) {
    return scopes.contains(scope);
  }
}
