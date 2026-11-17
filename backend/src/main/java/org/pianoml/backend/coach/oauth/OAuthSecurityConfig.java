package org.pianoml.backend.coach.oauth;

import lombok.extern.slf4j.Slf4j;
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
import org.springframework.stereotype.Component;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * The OAuth chain (coach, issue #414; docs/coach-oauth-design.md 4): the protocol endpoints MCP clients call,
 * {@code /oauth/authorize}, {@code /oauth/token}, {@code /oauth/register}, {@code /oauth/revoke}. Ordered after
 * the /mcp chain and before the main one.
 *
 * <p>No authentication (public clients; the user is authenticated later, on the consent page, through the main
 * chain), no CSRF and no session: nothing here reads a cookie, so a cross-site page has no ambient credential to
 * borrow, and these requests never become a session. CORS for any origin without credentials, so clients running
 * in a web page can call them. The consent API ({@code /oauth/requests/**}) is not in this chain: it needs the
 * session and CSRF of the main chain.
 *
 * <p>Also creates the metadata fetcher and schedules the daily cleanup of unused clients.
 */
@Configuration
public class OAuthSecurityConfig {

  static final String[] PATHS = {"/oauth/authorize", "/oauth/token", "/oauth/register", "/oauth/revoke"};

  @Bean
  @Order(2)
  public SecurityFilterChain oauthFilterChain(HttpSecurity http) throws Exception {
    UrlBasedCorsConfigurationSource cors = new UrlBasedCorsConfigurationSource();
    cors.registerCorsConfiguration("/oauth/**", PublicCors.configuration());
    http
      .securityMatcher(PATHS)
      .csrf(csrf -> csrf.disable())
      .cors(c -> c.configurationSource(cors))
      .httpBasic(basic -> basic.disable())
      .formLogin(form -> form.disable())
      .logout(logout -> logout.disable())
      .requestCache(cache -> cache.disable())
      .anonymous(anonymous -> anonymous.disable())
      .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .authorizeHttpRequests(authz -> authz.anyRequest().permitAll());
    return http.build();
  }

  @Bean(destroyMethod = "close")
  public ClientMetadataFetcher clientMetadataFetcher() {
    return new ClientMetadataFetcher(ClientMetadataFetcher.Rules.PRODUCTION);
  }

  /**
   * Every day: deletes OAuth clients never used for 24 hours or unused for 90 days, and authorization requests
   * and codes expired more than a day ago. Idempotent.
   */
  @Slf4j
  @Component
  @Lazy(false) // spring.main.lazy-initialization would otherwise never create it, and never schedule the job
  @Profile("!job")
  @EnableScheduling
  public static class CoachOAuthCleanup {

    private final CoachOAuthClientService clients;
    private final CoachOAuthAuthorizationService authorization;

    public CoachOAuthCleanup(CoachOAuthClientService clients, CoachOAuthAuthorizationService authorization) {
      this.clients = clients;
      this.authorization = authorization;
    }

    @Scheduled(cron = "${coach.oauth.cleanup.cron:0 37 3 * * *}", zone = "UTC")
    public void purge() {
      try {
        authorization.purgeExpired();
        int deleted = clients.purgeStale();
        if (deleted > 0) {
          log.info("Deleted {} unused coach OAuth client(s)", deleted);
        }
      } catch (RuntimeException e) {
        log.warn("Coach OAuth client cleanup failed: {}", e.toString());
      }
    }
  }
}
