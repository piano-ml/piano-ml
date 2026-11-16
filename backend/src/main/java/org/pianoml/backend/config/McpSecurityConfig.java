package org.pianoml.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.security.GrantAuthenticationFilter;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandlerImpl;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Security of /mcp/**, the endpoint external AI tools call with an access grant token (coach, issue #414).
 *
 * <p>A chain of its own, ordered before {@link SecurityConfig}'s catch-all chain, so the two can never be
 * confused: here only {@code pml_} tokens authenticate (no cookie, no session JWT), there a {@code pml_} token
 * authenticates nothing ({@link org.pianoml.backend.security.JwtAuthenticationFilter}). The main chain skips
 * CSRF for any request with an Authorization header; a grant token that worked there would be a full session.
 *
 * <p>No CSRF and no CORS: MCP hosts are programs, not browsers. A request carrying an Origin header comes from a
 * browser and is refused unless the origin is listed in {@code coach.mcp.allowed-origins} (empty by default).
 */
@Configuration
public class McpSecurityConfig {

  @Bean
  @Order(1)
  public SecurityFilterChain mcpFilterChain(HttpSecurity http, CoachGrantService grants,
                                            @Value("${coach.mcp.allowed-origins:}") List<String> allowedOrigins)
    throws Exception {
    http
      .securityMatcher("/mcp/**")
      .csrf(csrf -> csrf.disable())
      .cors(cors -> cors.disable())
      .httpBasic(basic -> basic.disable())
      .formLogin(form -> form.disable())
      .logout(logout -> logout.disable())
      .requestCache(cache -> cache.disable())
      .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .exceptionHandling(exceptions -> exceptions
        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
        .accessDeniedHandler(new AccessDeniedHandlerImpl()))
      .addFilterBefore(new OriginFilter(allowedOrigins), AnonymousAuthenticationFilter.class)
      .addFilterBefore(new GrantAuthenticationFilter(grants), AnonymousAuthenticationFilter.class)
      .authorizeHttpRequests(authz -> authz.anyRequest().authenticated());
    return http.build();
  }

  /** 403 for a request with an Origin header that is not explicitly allowed. Runs before authentication. */
  static class OriginFilter extends OncePerRequestFilter {

    private final Set<String> allowed;

    OriginFilter(List<String> allowedOrigins) {
      this.allowed = allowedOrigins == null ? Set.of() : allowedOrigins.stream()
        .map(String::strip)
        .filter(origin -> !origin.isEmpty())
        .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
      String origin = request.getHeader("Origin");
      if (origin != null && !allowed.contains(origin)) {
        response.sendError(HttpServletResponse.SC_FORBIDDEN);
        return;
      }
      chain.doFilter(request, response);
    }
  }

  /**
   * Deletes the grants expired or revoked more than 30 days ago, every day. A plain idempotent DELETE, so
   * several instances may run it at once. Not in the {@code job} profile (batch runs, no web server).
   */
  @Slf4j
  @Component
  @Lazy(false) // spring.main.lazy-initialization would otherwise never create it, and never schedule the job
  @Profile("!job")
  @EnableScheduling
  public static class CoachGrantCleanup {

    private final CoachGrantService grants;

    public CoachGrantCleanup(CoachGrantService grants) {
      this.grants = grants;
    }

    @Scheduled(cron = "${coach.grants.cleanup.cron:0 27 3 * * *}", zone = "UTC")
    public void purge() {
      try {
        grants.purgeStale();
      } catch (RuntimeException e) {
        log.warn("Coach grant cleanup failed: {}", e.toString());
      }
    }
  }
}
