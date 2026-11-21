package org.pianoml.backend.coach.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** A browser tab with Remote coach on, played by a test: a WebSocket client that records what it receives. */
class TestTab extends TextWebSocketHandler implements AutoCloseable {

  static final ObjectMapper JSON = new ObjectMapper();

  final UUID tabId = UUID.randomUUID();
  final BlockingQueue<JsonNode> frames = new LinkedBlockingQueue<>();
  final CompletableFuture<CloseStatus> closed = new CompletableFuture<>();
  WebSocketSession session;

  static TestTab connect(int port, String origin) throws Exception {
    TestTab tab = new TestTab();
    WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
    if (origin != null) {
      headers.setOrigin(origin);
    }
    tab.session = new StandardWebSocketClient()
      .execute(tab, headers, URI.create("ws://localhost:" + port + "/coach/ws"))
      .get(5, TimeUnit.SECONDS);
    return tab;
  }

  static TestTab connect(int port) throws Exception {
    return connect(port, null);
  }

  /** Connects and says hello with the ticket; waits for "ready". */
  static TestTab ready(int port, String ticket) throws Exception {
    TestTab tab = connect(port);
    tab.send(Map.of("type", "hello", "ticket", ticket, "tabId", tab.tabId.toString()));
    JsonNode ready = tab.next();
    if (ready == null || !"ready".equals(ready.path("type").asText())) {
      throw new AssertionError("No ready frame: " + ready + " / closed " + tab.closed.getNow(null));
    }
    return tab;
  }

  void send(Object frame) throws Exception {
    sendRaw(JSON.writeValueAsString(frame));
  }

  void sendRaw(String text) throws Exception {
    synchronized (this) {
      session.sendMessage(new TextMessage(text));
    }
  }

  JsonNode next() throws InterruptedException {
    return frames.poll(5, TimeUnit.SECONDS);
  }

  JsonNode next(long millis) throws InterruptedException {
    return frames.poll(millis, TimeUnit.MILLISECONDS);
  }

  CloseStatus closeStatus() throws Exception {
    return closed.get(10, TimeUnit.SECONDS);
  }

  /** Answers the next command with this envelope; returns the command. */
  JsonNode answerNext(Object envelope) throws Exception {
    JsonNode command = next();
    if (command == null || !"command".equals(command.path("type").asText())) {
      throw new AssertionError("No command: " + command);
    }
    send(Map.of("type", "result", "id", command.path("id").asText(), "result", envelope));
    return command;
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
    frames.add(JSON.readTree(message.getPayload()));
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    closed.complete(status);
  }

  @Override
  public void close() throws Exception {
    if (session != null && session.isOpen()) {
      session.close();
    }
  }
}
