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
import org.pianoml.backend.coach.oauth.PublicCors;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

  /** The sites allowed to call the API from a browser: CORS, and the Remote coach WebSocket handshake. */
  public static final List<String> ALLOWED_ORIGINS = List.of(
    "https://pianoml.org",
    "https://www.pianoml.org",
    "https://staging.pianoml.org"
  );

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
        // Browser error reports (issue #408): write-only, nothing readable comes back, and open to anonymous
        // users anyway, so a forged request can do no more than any visitor. Exempt so that errors raised
        // before the XSRF-TOKEN cookie exists, and navigator.sendBeacon (no custom header) on page exit, get through.
        .ignoringRequestMatchers("/error-report")
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
        // Admin only, whatever the method: must come before the open GET rule below (issue #408).
        .requestMatchers("/admin/**").hasRole("ADMIN")
        // Private to the logged-in user (coach access grants, issue #414): must come before the open GET rule.
        .requestMatchers(HttpMethod.GET, "/account/grants").authenticated()
        // Consent page API of the coach OAuth server (issue #414): the user's own pending requests.
        .requestMatchers(HttpMethod.GET, "/oauth/requests/**").authenticated()
        // Remote coach WebSocket handshake (issue #414): open, because authentication is the first message on the
        // socket (a one-time ticket from POST /coach/bridge/ticket), never the cookie: browsers send cookies on
        // WebSocket handshakes without any CORS check.
        .requestMatchers(HttpMethod.GET, "/coach/ws").permitAll()
        // Coach prompt catalog (issue #414): public on purpose, it holds no user data.
        .requestMatchers(HttpMethod.GET, "/coach/prompts").permitAll()
        .requestMatchers(HttpMethod.GET, "/**").permitAll()
        .requestMatchers(HttpMethod.POST,
          "/account/login",
          "/account/create",
          // Clearing the cookie must work even when the JWT has already expired.
          "/account/logout",
          "/score/play/stats",
          // Browser error reports, rate-limited per IP (ErrorReportRateLimiter)
          "/error-report"
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
    configuration.setAllowedOriginPatterns(ALLOWED_ORIGINS);
    configuration.setAllowCredentials(true); // necessary for httpOnly cookies
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    // Lets the SPA (another origin in production) read the server-chosen download file name.
    configuration.setExposedHeaders(List.of("Content-Disposition"));
    configuration.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    // OAuth discovery documents (coach, issue #414): read by MCP clients from any site, without credentials.
    // Registered first: the first matching pattern wins.
    source.registerCorsConfiguration("/.well-known/**", PublicCors.configuration());
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }
}
