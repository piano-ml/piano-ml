package org.pianoml.backend.coach.bridge;

import org.pianoml.backend.config.SecurityConfig;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.List;
import java.util.Map;

/**
 * Defense in depth on the Remote coach handshake (issue #414): an Origin header, when present, must be one of
 * the sites allowed by CORS. A missing Origin is accepted (the dev proxy strips it); the authentication is the
 * ticket of the first message anyway.
 */
public class BridgeHandshakeInterceptor implements HandshakeInterceptor {

  private final List<String> allowedOrigins;

  public BridgeHandshakeInterceptor(List<String> allowedOrigins) {
    this.allowedOrigins = allowedOrigins;
  }

  public BridgeHandshakeInterceptor() {
    this(SecurityConfig.ALLOWED_ORIGINS);
  }

  @Override
  public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler,
                                 Map<String, Object> attributes) {
    String origin = request.getHeaders().getOrigin();
    if (origin != null && !allowedOrigins.contains(origin)) {
      response.setStatusCode(HttpStatus.FORBIDDEN);
      return false;
    }
    return true;
  }

  @Override
  public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Exception exception) {
  }
}
