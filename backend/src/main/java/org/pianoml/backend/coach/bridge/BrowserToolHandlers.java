package org.pianoml.backend.coach.bridge;

import org.pianoml.backend.coach.CoachToolCatalog;
import org.pianoml.backend.coach.CoachToolDefinition;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.coach.CoachToolResult;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

/**
 * The browser tools of the contract (player and selection, tools 21 to 30), served on the MCP endpoint by
 * forwarding them to the user's Remote coach tab (issue #414, phase 9). The dispatcher has already checked the
 * scope, the arguments and the rate limit; the tab's result comes back unchanged.
 */
@Component
public class BrowserToolHandlers {

  /** wait_for_take_end waits in the tab for up to its own timeoutSeconds: the bridge waits a little longer. */
  static final String WAIT_FOR_TAKE_END = "wait_for_take_end";
  static final int WAIT_MARGIN_SECONDS = 5;
  static final int DEFAULT_TAKE_WAIT_SECONDS = 30;

  private final List<CoachToolHandler> handlers;

  public BrowserToolHandlers(CoachToolCatalog catalog, PlayerBridge bridge, ObjectMapper objectMapper) {
    this.handlers = catalog.all().stream()
      .filter(tool -> CoachToolDefinition.RUNS_IN_BROWSER.equals(tool.runsIn()))
      .map(tool -> (CoachToolHandler) new BrowserTool(tool, bridge, objectMapper))
      .toList();
  }

  public List<CoachToolHandler> handlers() {
    return handlers;
  }

  /** How long the bridge waits for the tab's answer. */
  static int waitSeconds(CoachToolDefinition tool, Map<String, Object> arguments) {
    if (WAIT_FOR_TAKE_END.equals(tool.name())) {
      Object timeout = arguments.get("timeoutSeconds");
      int seconds = timeout instanceof Number n ? n.intValue() : DEFAULT_TAKE_WAIT_SECONDS;
      return seconds + WAIT_MARGIN_SECONDS;
    }
    return tool.timeoutSeconds();
  }

  private record BrowserTool(CoachToolDefinition tool, PlayerBridge bridge, ObjectMapper objectMapper) implements CoachToolHandler {

    @Override
    public String name() {
      return tool.name();
    }

    @Override
    public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
      CoachToolResult result = bridge.send(principal.userId(), principal.grantId(), principal.clientName(), tool.name(),
        objectMapper.writeValueAsString(arguments), waitSeconds(tool, arguments));
      if (!result.ok()) {
        throw new CoachToolException(result.code(), result.message());
      }
      return result.data();
    }
  }
}
