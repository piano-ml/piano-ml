package org.pianoml.backend.coach.bridge;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/** The Remote coach WebSocket at /coach/ws (issue #414): plain handler, no STOMP, no SockJS. */
@Configuration
@EnableWebSocket
public class BridgeWebSocketConfig implements WebSocketConfigurer {

  private final BridgeWebSocketHandler handler;

  public BridgeWebSocketConfig(BridgeWebSocketHandler handler) {
    this.handler = handler;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry.addHandler(handler, "/coach/ws")
      .addInterceptors(new BridgeHandshakeInterceptor())
      // Spring's own origin check is replaced by BridgeHandshakeInterceptor, which also accepts a missing Origin
      .setAllowedOriginPatterns("*");
  }
}
