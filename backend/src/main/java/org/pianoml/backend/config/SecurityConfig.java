package org.pianoml.backend.config;

import org.pianoml.backend.security.CsrfAwareAccessDeniedHandler;
import org.pianoml.backend.security.CsrfCookieFilter;
import org.pianoml.backend.security.JwtAuthenticationFilter;
import org.pianoml.backend.security.OriginAwareCsrfTokenRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.util.matcher.RequestHeaderRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

  @Autowired
  private JwtAuthenticationFilter jwtAuthenticationFilter;

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public AuthenticationManager authenticationManager(AuthenticationConfiguration authenticationConfiguration) throws Exception {
    return authenticationConfiguration.getAuthenticationManager();
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
      // The JWT travels in an HttpOnly "Authorization" cookie. SameSite=Strict (AccountController) already
      // blocks cross-site requests; the CSRF token also covers same-site attackers (any other *.pianoml.org
      // host) and browsers without SameSite support. SPA double-submit:
      // the token is exposed in the XSRF-TOKEN cookie and must come back in the X-XSRF-TOKEN header
      // on every state-changing request (GET/HEAD/OPTIONS/TRACE are never checked).
      .csrf(csrf -> csrf
        .spa()
        .csrfTokenRepository(new OriginAwareCsrfTokenRepository())
        // Pre-authentication endpoints: no session cookie to abuse yet.
        .ignoringRequestMatchers("/account/login", "/account/create")
        // Explicit bearer-token clients (scripts, tools): a cross-site page cannot set this header.
        .ignoringRequestMatchers(new RequestHeaderRequestMatcher("Authorization"))
      )
      .cors(httpSecurityCorsConfigurer -> httpSecurityCorsConfigurer.configurationSource(corsConfigurationSource()))
      .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      // 401 = no/expired authentication (the SPA ends the session); 403 = refused but still logged in,
      // with a body telling a CSRF rejection (the SPA retries) from a plain access denial.
      .exceptionHandling(exceptions -> exceptions
        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
        .accessDeniedHandler(new CsrfAwareAccessDeniedHandler())
      )
      .authorizeHttpRequests(authz -> authz
        .requestMatchers(HttpMethod.GET, "/**").permitAll()
        .requestMatchers(HttpMethod.POST,
          "/account/login",
          "/account/create",
          // Clearing the cookie must work even when the JWT has already expired.
          "/account/logout",
          "/score/play/stats"
        ).permitAll()
        .anyRequest().authenticated()
      );

    http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
    http.addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class);

    return http.build();
  }

  private CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    // No localhost: local development calls the API through the frontend dev proxy (same-origin for the
    // browser, Origin header stripped), so the API never sees a cross-origin request from localhost.
    configuration.setAllowedOriginPatterns(List.of(
      "https://pianoml.org",
      "https://www.pianoml.org",
      "https://staging.pianoml.org"
    ));
    configuration.setAllowCredentials(true); // necessary for httpOnly cookies
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }
}
