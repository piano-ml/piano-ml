package org.pianoml.backend.config;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.coach.oauth.CoachOAuthSettings;
import org.pianoml.backend.coach.oauth.CoachOAuthTokenService;
import org.pianoml.backend.coach.oauth.McpAuthenticationEntryPoint;
import org.pianoml.backend.coach.oauth.PublicCors;
import org.pianoml.backend.security.GrantAuthenticationFilter;
import org.pianoml.backend.service.CoachGrantService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandlerImpl;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Security of /mcp/**, the endpoint external AI tools call with an access grant token (coach, issue #414).
 *
 * <p>A chain of its own, ordered before {@link SecurityConfig}'s catch-all chain, so the two can never be
 * confused: here only grant tokens authenticate ({@code pml_} personal, {@code pmo_} OAuth; no cookie, no session
 * JWT), there a {@code pml_} token
 * authenticates nothing ({@link org.pianoml.backend.security.JwtAuthenticationFilter}). The main chain skips
 * CSRF for any request with an Authorization header; a grant token that worked there would be a full session.
 *
 * <p>Clients can run anywhere, a web page included (docs/coach-oauth-design.md 2.6): any Origin is accepted, with
 * CORS for any origin and never credentials ({@link PublicCors}); preflight requests are answered before
 * authentication. No CSRF: no cookie is read here, so a cross-site page has no ambient credential to borrow.
 *
 * <p>A missing or invalid token gets 401 with a {@code WWW-Authenticate} challenge
 * ({@link McpAuthenticationEntryPoint}), which MCP clients start OAuth sign-in from.
 */
@Configuration
public class McpSecurityConfig {

  @Bean
  @Order(1)
  public SecurityFilterChain mcpFilterChain(HttpSecurity http, CoachGrantService grants, CoachOAuthSettings oauth,
                                            CoachOAuthTokenService oauthTokens)
    throws Exception {
    UrlBasedCorsConfigurationSource cors = new UrlBasedCorsConfigurationSource();
    cors.registerCorsConfiguration("/mcp/**", PublicCors.configuration());
    http
      .securityMatcher("/mcp/**")
      .csrf(csrf -> csrf.disable())
      .cors(c -> c.configurationSource(cors))
      .httpBasic(basic -> basic.disable())
      .formLogin(form -> form.disable())
      .logout(logout -> logout.disable())
      .requestCache(cache -> cache.disable())
      .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .exceptionHandling(exceptions -> exceptions
        .authenticationEntryPoint(new McpAuthenticationEntryPoint(oauth))
        .accessDeniedHandler(new AccessDeniedHandlerImpl()))
      .addFilterBefore(new GrantAuthenticationFilter(grants, oauthTokens), AnonymousAuthenticationFilter.class)
      .authorizeHttpRequests(authz -> authz.anyRequest().authenticated());
    return http.build();
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
