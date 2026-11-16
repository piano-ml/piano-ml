package org.pianoml.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.service.ErrorReportService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Error reports (issue #408): the capture fallback and the daily retention purge.
 */
@Configuration
public class ErrorReportConfig {

  /**
   * Fallback capture for the errors no exception handler saw: an exception escaping the controllers or the
   * filters, or a 5xx set without an exception. Runs first, outside Spring Security (the user is not known
   * at that point; the handlers, which run inside, record it when they can).
   */
  @Bean
  @ConditionalOnWebApplication
  public FilterRegistrationBean<OncePerRequestFilter> errorReportCaptureFilter(ObjectProvider<ErrorReportService> service) {
    OncePerRequestFilter filter = new OncePerRequestFilter() {
      @Override
      protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        try {
          chain.doFilter(request, response);
        } catch (IOException | ServletException | RuntimeException e) {
          service.getObject().recordBackend(e, request, HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
          throw e;
        }
        if (response.getStatus() >= 500) {
          service.getObject().recordBackend(null, request, response.getStatus());
        }
      }
    };
    FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>(filter);
    registration.setName("errorReportCaptureFilter");
    registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
    return registration;
  }

  /**
   * Deletes the reports older than {@code errors.retention} every day. A plain idempotent DELETE, so several
   * instances may run it at once. Not in the {@code job} profile (batch runs, no web server). Cloud Run may
   * scale the service to zero and miss the time: {@link ErrorReportService} also purges on the first report
   * of each day.
   */
  @Slf4j
  @Component
  @Lazy(false) // spring.main.lazy-initialization would otherwise never create it, and never schedule the job
  @Profile("!job")
  @EnableScheduling
  public static class ErrorReportRetention {

    private final ErrorReportService service;

    public ErrorReportRetention(ErrorReportService service) {
      this.service = service;
    }

    @Scheduled(cron = "${errors.retention.cron:0 17 3 * * *}", zone = "UTC")
    public void purge() {
      try {
        service.purge();
      } catch (RuntimeException e) {
        log.warn("Error report purge failed: {}", e.toString());
      }
    }
  }
}
