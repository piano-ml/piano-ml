package org.pianoml.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.pianoml.backend.coach.oauth.CoachOAuthTokenService;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

/**
 * Authenticates /mcp/** requests with an access grant token (coach, issue #414): a personal access token
 * {@code Authorization: Bearer pml_...}, or an OAuth access token {@code pmo_...} (phase O4). Used only by the /mcp filter chain ({@link org.pianoml.backend.config.McpSecurityConfig}).
 *
 * <p>Deliberately not a Spring bean: Spring Boot registers every Filter bean for all requests, and this one must
 * never run anywhere else. It reads no cookie: a browser session never reaches /mcp, and a grant never acts as a
 * session. A missing or invalid token leaves the request anonymous; the chain then answers 401.
 */
public class GrantAuthenticationFilter extends OncePerRequestFilter {

  private final CoachGrantService grants;
  private final CoachOAuthTokenService oauthTokens;

  public GrantAuthenticationFilter(CoachGrantService grants, CoachOAuthTokenService oauthTokens) {
    this.grants = grants;
    this.oauthTokens = oauthTokens;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
      String token = header.substring(7).strip();
      Optional<GrantPrincipal> grant = token.startsWith(CoachOAuthTokenService.ACCESS_PREFIX)
        ? oauthTokens.authenticate(token) : grants.authenticate(token);
      grant.ifPresent(principal -> {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new GrantAuthenticationToken(principal));
        SecurityContextHolder.setContext(context);
        request.setAttribute(GrantPrincipal.REQUEST_ATTRIBUTE, principal);
      });
    }
    chain.doFilter(request, response);
  }
}
