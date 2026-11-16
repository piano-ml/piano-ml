package org.pianoml.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Authenticates /mcp/** requests with an access grant token, {@code Authorization: Bearer pml_...} (coach,
 * issue #414). Used only by the /mcp filter chain ({@link org.pianoml.backend.config.McpSecurityConfig}).
 *
 * <p>Deliberately not a Spring bean: Spring Boot registers every Filter bean for all requests, and this one must
 * never run anywhere else. It reads no cookie: a browser session never reaches /mcp, and a grant never acts as a
 * session. A missing or invalid token leaves the request anonymous; the chain then answers 401.
 */
public class GrantAuthenticationFilter extends OncePerRequestFilter {

  private final CoachGrantService grants;

  public GrantAuthenticationFilter(CoachGrantService grants) {
    this.grants = grants;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
      grants.authenticate(header.substring(7).strip()).ifPresent(principal -> {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new GrantAuthenticationToken(principal));
        SecurityContextHolder.setContext(context);
        request.setAttribute(GrantPrincipal.REQUEST_ATTRIBUTE, principal);
      });
    }
    chain.doFilter(request, response);
  }
}
