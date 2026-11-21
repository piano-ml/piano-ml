package org.pianoml.backend.coach.bridge;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.CoachCommand;
import org.pianoml.backend.repository.CoachCommandRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The Remote coach sockets of this server instance (issue #414): tab id -> session and its authenticated user.
 * Delivery is claimed in the database first, so a command reaches one socket once, whatever the instance.
 */
@Slf4j
@Component
public class BridgeSessions {

  public record Entry(WebSocketSession session, UUID userId) {
  }

  /** Identifies this instance in coach_presence. */
  private final String instance = UUID.randomUUID().toString();
  private final Map<UUID, Entry> byTab = new ConcurrentHashMap<>();
  private final CoachCommandRepository commands;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public BridgeSessions(CoachCommandRepository commands, ObjectMapper objectMapper, Clock clock) {
    this.commands = commands;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  public String instance() {
    return instance;
  }

  public void put(UUID tabId, WebSocketSession session, UUID userId) {
    byTab.put(tabId, new Entry(session, userId));
  }

  /** Removes the tab only if it is still this session's (a reconnection may have replaced it). */
  public boolean remove(UUID tabId, WebSocketSession session) {
    Entry entry = byTab.get(tabId);
    return entry != null && entry.session() == session && byTab.remove(tabId, entry);
  }

  public boolean isEmpty() {
    return byTab.isEmpty();
  }

  public Set<UUID> tabIds() {
    return Set.copyOf(byTab.keySet());
  }

  public boolean isLocal(UUID tabId) {
    return byTab.containsKey(tabId);
  }

  /**
   * Sends the command to its tab when the tab's socket is here and belongs to the command's user, after
   * claiming it in the database (pending -> sent). Returns whether it was sent.
   */
  public boolean deliver(CoachCommand command) {
    Entry entry = byTab.get(command.getTabId());
    if (entry == null || !entry.userId().equals(command.getUserId()) || !entry.session().isOpen()) {
      return false;
    }
    if (commands.claim(command.getId(), OffsetDateTime.now(clock)) != 1) {
      return false;
    }
    Map<String, Object> frame = new LinkedHashMap<>();
    frame.put("type", "command");
    frame.put("id", command.getId().toString());
    frame.put("tool", command.getTool());
    frame.put("args", command.getArgs() == null ? Map.of() : objectMapper.readValue(command.getArgs(), Map.class));
    frame.put("client", command.getClientName());
    try {
      entry.session().sendMessage(new TextMessage(objectMapper.writeValueAsString(frame)));
      return true;
    } catch (IOException | IllegalStateException e) {
      log.warn("Remote coach command {} could not be sent: {}", command.getId(), e.getClass().getSimpleName());
      return false;
    }
  }
}
