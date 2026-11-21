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

  /** Result polling: every 150 ms for the first 2 seconds (most commands answer within that), then slower. */
  static final long POLL_MS = 150;
  static final long POLL_MS_AFTER_2S = 400;
  static final long POLL_MS_AFTER_10S = 1000;
  public static final String BUSY = "BUSY";

  private final CoachToolCatalog catalog;
  private final CoachPresenceRepository presence;
  private final CoachCommandRepository commands;
  private final BridgeSessions sessions;
  private final CoachRows rows;
  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final int maxInFlight;

  /**
   * {@code coach.bridge.max-in-flight} (2 by default): browser commands a user may have waiting at once, across
   * instances. Each waits on a thread for up to the tool's timeout; the per-grant rate limit bounds how many start
   * per minute, not how many wait together. Two let a coach check the player while a wait_for_take_end runs.
   */
  public PlayerBridge(CoachToolCatalog catalog, CoachPresenceRepository presence, CoachCommandRepository commands,
                      BridgeSessions sessions, CoachRows rows, ObjectMapper objectMapper, Clock clock,
                      @org.springframework.beans.factory.annotation.Value("${coach.bridge.max-in-flight:2}") int maxInFlight) {
    this.maxInFlight = maxInFlight;
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
    if (commands.countInFlight(userId, now) >= maxInFlight) {
      return CoachToolResult.error(BUSY, "Another player command for this student is still running (for example "
        + "wait_for_take_end). Wait for it to finish before sending another one, or call stop to end the current take. "
        + "Do not retry in a loop.");
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
    long started = System.nanoTime();
    long deadline = started + waitSeconds * 1_000_000_000L;
    while (System.nanoTime() < deadline) {
      Optional<CoachCommand> current = commands.findById(command.getId());
      if (current.isPresent() && CoachCommand.DONE.equals(current.get().getStatus())) {
        return parse(current.get().getResult());
      }
      try {
        Thread.sleep(pollDelay((System.nanoTime() - started) / 1_000_000L));
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        break;
      }
    }
    commands.expire(command.getId());
    return CoachToolResult.error("PLAYER_TIMEOUT",
      "The PianoML tab did not answer in time. Check that it is still open, then try again.");
  }

  /** The pause before the next read of the result, after {@code elapsedMs} of waiting. */
  static long pollDelay(long elapsedMs) {
    if (elapsedMs < 2_000) {
      return POLL_MS;
    }
    return elapsedMs < 10_000 ? POLL_MS_AFTER_2S : POLL_MS_AFTER_10S;
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
