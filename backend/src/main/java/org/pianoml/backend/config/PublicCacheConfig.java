package org.pianoml.backend.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.filter.ShallowEtagHeaderFilter;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Cache headers of the public GET endpoints ({@link PublicCachePolicy}).
 */
@Configuration
public class PublicCacheConfig {

  /**
   * ETag and 304 Not Modified for the public endpoints only: the filter buffers the whole body, which the score
   * file downloads must not go through.
   */
  @Bean
  @ConditionalOnWebApplication
  public FilterRegistrationBean<ShallowEtagHeaderFilter> publicCacheEtagFilter() {
    ShallowEtagHeaderFilter filter = new ShallowEtagHeaderFilter() {
      @Override
      protected boolean shouldNotFilter(HttpServletRequest request) {
        return !PublicCachePolicy.isPublic(request);
      }
    };
    FilterRegistrationBean<ShallowEtagHeaderFilter> registration = new FilterRegistrationBean<>(filter);
    registration.setName("publicCacheEtagFilter");
    return registration;
  }

  /**
   * Sets the policy's Cache-Control on the successful responses of the public endpoints, before the body is
   * written: Spring Security then leaves its own "no-cache, no-store" out. Errors keep the default.
   */
  @ControllerAdvice
  public static class PublicCacheHeadersAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
      return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
                                  Class<? extends HttpMessageConverter<?>> converterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
      if (request instanceof ServletServerHttpRequest servletRequest
        && response instanceof ServletServerHttpResponse servletResponse
        && isSuccess(servletResponse.getServletResponse())) {
        PublicCachePolicy.cacheControl(servletRequest.getServletRequest())
          .ifPresent(cacheControl -> response.getHeaders().set(HttpHeaders.CACHE_CONTROL, cacheControl.getHeaderValue()));
      }
      return body;
    }

    private static boolean isSuccess(HttpServletResponse response) {
      return response.getStatus() >= 200 && response.getStatus() < 300;
    }
  }
}
