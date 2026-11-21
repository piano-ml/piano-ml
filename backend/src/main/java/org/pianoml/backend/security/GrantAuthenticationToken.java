package org.pianoml.backend.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** An authenticated grant (coach, issue #414): authorities are {@code SCOPE_<scope>}. */
public class GrantAuthenticationToken extends AbstractAuthenticationToken {

  private final GrantPrincipal principal;

  public GrantAuthenticationToken(GrantPrincipal principal) {
    super(principal.scopes().stream().map(scope -> new SimpleGrantedAuthority("SCOPE_" + scope)).toList());
    this.principal = principal;
    setAuthenticated(true);
  }

  @Override
  public GrantPrincipal getPrincipal() {
    return principal;
  }

  /** There are none: the token is checked and dropped by {@link GrantAuthenticationFilter}. */
  @Override
  public Object getCredentials() {
    return null;
  }
}
