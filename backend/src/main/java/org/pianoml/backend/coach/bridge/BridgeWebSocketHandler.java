package org.pianoml.backend.coach.bridge;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.CoachPresence;
import org.pianoml.backend.repository.CoachCommandRepository;
import org.pianoml.backend.repository.CoachPresenceRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * The Remote coach WebSocket /coach/ws (issue #414): the protocol of section 3.3 of the specification. The first
 * message must be a hello with a valid one-time ticket; then the tab answers commands with results and keeps
 * its presence alive.
 */
@Slf4j
@Component
public class BridgeWebSocketHandler extends TextWebSocketHandler {

  public static final CloseStatus BAD_TICKET = new CloseStatus(4401, "unauthorized");
  public static final CloseStatus NO_HELLO = new CloseStatus(4408, "no hello");
  public static final CloseStatus TOO_MANY = new CloseStatus(4429, "too many sockets");
  public static final CloseStatus RENEW = new CloseStatus(4000, "renew");

  static final int MAX_SOCKETS_PER_USER = 3;
  static final Duration PRESENCE_TTL = Duration.ofSeconds(45);
  static final int MAX_RESULT_CHARS = 64 * 1024;
  /** Larger text frames close the socket (1009). Set per session: a container-wide bean breaks mock web tests. */
  static final int MAX_FRAME_BYTES = 64 * 1024;
  private static final String USER = "coach.userId";
  private static final String TAB = "coach.tabId";
  private static final String SAFE = "coach.safeSession";
  private static final String TIMERS = "coach.timers";

  private final BridgeTicketService tickets;
  private final BridgeSessions sessions;
  private final CoachPresenceRepository presence;
  private final CoachCommandRepository commands;
  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final Duration helloTimeout;
  private final Duration maxAge;
  /** Hello timeout and renewal of each socket; cancelled tasks leave the queue (a closed socket keeps nothing). */
  private final ScheduledThreadPoolExecutor timers = timerExecutor();

  private static ScheduledThreadPoolExecutor timerExecutor() {
    ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1, r -> {
      Thread thread = new Thread(r, "coach-bridge-timers");
      thread.setDaemon(true);
      return thread;
    });
    executor.setRemoveOnCancelPolicy(true);
    return executor;
  }

  public BridgeWebSocketHandler(BridgeTicketService tickets, BridgeSessions sessions, CoachPresenceRepository presence,
                                CoachCommandRepository commands, ObjectMapper objectMapper, Clock clock,
                                @Value("${coach.bridge.hello-timeout:PT5S}") Duration helloTimeout,
                                @Value("${coach.bridge.max-age:PT55M}") Duration maxAge) {
    this.tickets = tickets;
    this.sessions = sessions;
    this.presence = presence;
    this.commands = commands;
    this.objectMapper = objectMapper;
    this.clock = clock;
    this.helloTimeout = helloTimeout;
    this.maxAge = maxAge;
  }

  @PreDestroy
  void stop() {
    timers.shutdownNow();
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession raw) {
    raw.setTextMessageSizeLimit(MAX_FRAME_BYTES);
    raw.setBinaryMessageSizeLimit(MAX_FRAME_BYTES);
    // Sends may come from the pump, MCP calls and this handler at once
    WebSocketSession session = new ConcurrentWebSocketSessionDecorator(raw, 10_000, 128 * 1024);
    raw.getAttributes().put(SAFE, session);
    ScheduledFuture<?> hello = timers.schedule(() -> {
      if (raw.isOpen() && !raw.getAttributes().containsKey(USER)) {
        close(raw, NO_HELLO);
      }
    }, helloTimeout.toMillis(), TimeUnit.MILLISECONDS);
    ScheduledFuture<?> renew = timers.schedule(() -> close(raw, RENEW), maxAge.toMillis(), TimeUnit.MILLISECONDS);
    raw.getAttributes().put(TIMERS, List.of(hello, renew));
  }

  /** Timers still scheduled for this socket: what afterConnectionClosed cancels. For tests. */
  int scheduledTimers() {
    return timers.getQueue().size();
  }

  @Override
  protected void handleTextMessage(WebSocketSession raw, TextMessage message) {
    JsonNode frame;
    try {
      frame = objectMapper.readTree(message.getPayload());
    } catch (RuntimeException e) {
      close(raw, BAD_TICKET);
      return;
    }
    String type = frame.path("type").asString("");
    UUID userId = (UUID) raw.getAttributes().get(USER);
    if (userId == null) {
      if ("hello".equals(type)) {
        hello(raw, frame);
      } else {
        close(raw, BAD_TICKET);
      }
      return;
    }
    UUID tabId = (UUID) raw.getAttributes().get(TAB);
    OffsetDateTime now = OffsetDateTime.now(clock);
    switch (type) {
      case "ping" -> {
        presence.seen(tabId, userId, now);
        send(raw, Map.of("type", "pong"));
      }
      case "focus" -> presence.focused(tabId, userId, now);
      case "result" -> result(raw, userId, tabId, frame);
      default -> close(raw, BAD_TICKET);
    }
  }

  private void hello(WebSocketSession raw, JsonNode frame) {
    Optional<UUID> userId = tickets.consume(frame.path("ticket").asString(null));
    UUID tabId = parseUuid(frame.path("tabId").asString(null));
    if (userId.isEmpty() || tabId == null) {
      close(raw, BAD_TICKET);
      return;
    }
    OffsetDateTime now = OffsetDateTime.now(clock);
    Optional<CoachPresence> existing = presence.findById(tabId);
    if (existing.isPresent() && !existing.get().getUserId().equals(userId.get())) {
      close(raw, BAD_TICKET);
      return;
    }
    long others = presence.live(userId.get(), now.minus(PRESENCE_TTL)).stream()
      .filter(p -> !p.getTabId().equals(tabId)).count();
    if (others >= MAX_SOCKETS_PER_USER) {
      close(raw, TOO_MANY);
      return;
    }
    raw.getAttributes().put(USER, userId.get());
    raw.getAttributes().put(TAB, tabId);
    sessions.put(tabId, safe(raw), userId.get());
    CoachPresence row = existing.orElseGet(CoachPresence::new);
    row.setTabId(tabId);
    row.setUserId(userId.get());
    row.setInstance(sessions.instance());
    row.setConnectedAt(now);
    row.setLastSeenAt(now);
    row.setLastFocusAt(now);
    presence.save(row);
    send(raw, Map.of("type", "ready"));
  }

  private void result(WebSocketSession raw, UUID userId, UUID tabId, JsonNode frame) {
    UUID id = parseUuid(frame.path("id").asString(null));
    JsonNode result = frame.path("result");
    if (id == null || result.isMissingNode()) {
      close(raw, BAD_TICKET);
      return;
    }
    String json = objectMapper.writeValueAsString(result);
    if (json.length() > MAX_RESULT_CHARS) {
      json = objectMapper.writeValueAsString(Map.of("ok", false, "code", "INTERNAL", "message", "The result was too large."));
    }
    if (commands.complete(id, userId, tabId, json) != 1) {
      log.debug("Remote coach result ignored for command {}", id);
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession raw, CloseStatus status) {
    if (raw.getAttributes().remove(TIMERS) instanceof List<?> scheduled) {
      scheduled.forEach(f -> ((ScheduledFuture<?>) f).cancel(false));
    }
    UUID userId = (UUID) raw.getAttributes().get(USER);
    UUID tabId = (UUID) raw.getAttributes().get(TAB);
    if (userId != null && tabId != null && sessions.remove(tabId, safe(raw))) {
      presence.remove(tabId, userId);
    }
  }

  private WebSocketSession safe(WebSocketSession raw) {
    Object safe = raw.getAttributes().get(SAFE);
    return safe instanceof WebSocketSession s ? s : raw;
  }

  private void send(WebSocketSession raw, Map<String, Object> frame) {
    try {
      safe(raw).sendMessage(new TextMessage(objectMapper.writeValueAsString(frame)));
    } catch (IOException | IllegalStateException e) {
      log.debug("Remote coach frame not sent: {}", e.getClass().getSimpleName());
    }
  }

  private static void close(WebSocketSession raw, CloseStatus status) {
    try {
      if (raw.isOpen()) {
        raw.close(status);
      }
    } catch (IOException e) {
      // already gone
    }
  }

  private static UUID parseUuid(String value) {
    if (value == null) {
      return null;
    }
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException e) {
      return null;
    }
  }
}
