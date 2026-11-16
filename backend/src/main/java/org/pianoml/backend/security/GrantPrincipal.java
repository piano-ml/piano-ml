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

  @Override
  public String getName() {
    return userId.toString();
  }

  public boolean hasScope(String scope) {
    return scopes.contains(scope);
  }
}
