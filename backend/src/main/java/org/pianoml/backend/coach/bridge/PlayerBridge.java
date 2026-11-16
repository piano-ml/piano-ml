package org.pianoml.backend.coach.bridge;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.coach.CoachToolCatalog;
import org.pianoml.backend.coach.CoachToolDefinition;
import org.pianoml.backend.coach.CoachToolResult;
import org.pianoml.backend.coach.tools.CoachRows;
import org.pianoml.backend.entity.CoachCommand;
import org.pianoml.backend.entity.CoachPresence;
import org.pianoml.backend.repository.CoachCommandRepository;
import org.pianoml.backend.repository.CoachPresenceRepository;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Sends a browser tool call to the user's Remote coach tab and waits for its result (issue #414). The command is
 * a database row: the instance holding the tab's socket delivers it (at once when it is this one, else its pump
 * does), and the result comes back in the same row. Identity is checked in the data: a command carries the user
 * of the grant, and only a socket of that user receives it or answers it.
 */
@Slf4j
@Service
public class PlayerBridge {

  static final long POLL_MS = 150;

  private final CoachToolCatalog catalog;
  private final CoachPresenceRepository presence;
  private final CoachCommandRepository commands;
  private final BridgeSessions sessions;
  private final CoachRows rows;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public PlayerBridge(CoachToolCatalog catalog, CoachPresenceRepository presence, CoachCommandRepository commands,
                      BridgeSessions sessions, CoachRows rows, ObjectMapper objectMapper, Clock clock) {
    this.catalog = catalog;
    this.presence = presence;
    this.commands = commands;
    this.sessions = sessions;
    this.rows = rows;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  /** The user's tabs with Remote coach on, seen in the last 45 seconds. */
  public long connectedTabs(UUID userId) {
    return presence.countLive(userId, OffsetDateTime.now(clock).minus(BridgeWebSocketHandler.PRESENCE_TTL));
  }

  public CoachToolResult send(UUID userId, UUID grantId, String clientName, String tool, String argsJson, int waitSeconds) {
    if (catalog.find(tool).filter(t -> CoachToolDefinition.RUNS_IN_BROWSER.equals(t.runsIn())).isEmpty()) {
      throw new IllegalArgumentException("Not a browser tool: " + tool);
    }
    OffsetDateTime now = OffsetDateTime.now(clock);
    List<CoachPresence> tabs = presence.live(userId, now.minus(BridgeWebSocketHandler.PRESENCE_TTL));
    if (tabs.isEmpty()) {
      return CoachToolResult.error("NO_ACTIVE_PLAYER",
        "No PianoML tab has Remote coach on. Ask the student to open " + rows.siteUrl() + "/?remoteCoach=1 and confirm.");
    }
    CoachCommand command = new CoachCommand();
    command.setId(UUID.randomUUID());
    command.setUserId(userId);
    command.setTabId(tabs.get(0).getTabId());
    command.setGrantId(grantId);
    command.setClientName(clientName.length() > 80 ? clientName.substring(0, 80) : clientName);
    command.setTool(tool);
    command.setArgs(argsJson);
    command.setStatus(CoachCommand.PENDING);
    command.setCreatedAt(now);
    command.setExpiresAt(now.plusSeconds(waitSeconds + 5L));
    commands.save(command);

    if (sessions.isLocal(command.getTabId())) {
      sessions.deliver(command);
    }
    long deadline = System.nanoTime() + waitSeconds * 1_000_000_000L;
    while (System.nanoTime() < deadline) {
      Optional<CoachCommand> current = commands.findById(command.getId());
      if (current.isPresent() && CoachCommand.DONE.equals(current.get().getStatus())) {
        return parse(current.get().getResult());
      }
      try {
        Thread.sleep(POLL_MS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        break;
      }
    }
    commands.expire(command.getId());
    return CoachToolResult.error("PLAYER_TIMEOUT",
      "The PianoML tab did not answer in time. Check that it is still open, then try again.");
  }

  private CoachToolResult parse(String result) {
    try {
      JsonNode node = objectMapper.readTree(result);
      if (node.path("ok").asBoolean(false)) {
        return CoachToolResult.success(objectMapper.treeToValue(node.path("data"), Object.class));
      }
      return CoachToolResult.error(node.path("code").asString("INTERNAL"), node.path("message").asString("The tool failed."));
    } catch (RuntimeException e) {
      log.warn("Unreadable Remote coach result: {}", e.getClass().getSimpleName());
      return CoachToolResult.error("INTERNAL", "The tool failed.");
    }
  }
}
