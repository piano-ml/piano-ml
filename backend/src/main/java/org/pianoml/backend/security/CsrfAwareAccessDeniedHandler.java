package org.pianoml.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;

import java.io.IOException;

/**
 * 403 responses that tell the SPA why a request was refused, so it can react correctly:
 * <ul>
 *   <li>CSRF rejection (missing/stale X-XSRF-TOKEN): body {@code {"error":"CSRF_TOKEN_INVALID"}}. The response
 *       also carries a fresh XSRF-TOKEN cookie, so the frontend retries once instead of logging the user out.</li>
 *   <li>Any other access denial: body {@code {"error":"ACCESS_DENIED"}}; the session is still valid.</li>
 * </ul>
 * Missing or expired authentication is a 401 (see SecurityConfig), the only status that ends the session.
 */
public class CsrfAwareAccessDeniedHandler implements AccessDeniedHandler {

  public static final String CSRF_ERROR = "CSRF_TOKEN_INVALID";
  public static final String ACCESS_DENIED_ERROR = "ACCESS_DENIED";

  @Override
  public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
    throws IOException {
    if (response.isCommitted()) {
      return;
    }
    String code = ex instanceof CsrfException ? CSRF_ERROR : ACCESS_DENIED_ERROR;
    response.setStatus(HttpStatus.FORBIDDEN.value());
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.getWriter().write("{\"error\":\"" + code + "\"}");
  }
}
