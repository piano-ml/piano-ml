package org.pianoml.backend.coach;

import java.util.List;
import java.util.Map;

/**
 * One tool of the contract file openapi/coach-tools.json (coach, issue #414): served by the MCP endpoint when
 * {@code runsIn} is "server" and a {@link CoachToolHandler} exists, executed in the browser when "browser".
 */
public record CoachToolDefinition(String name, String runsIn, List<String> scopes, int timeoutSeconds,
                                  String description, Map<String, Object> inputSchema) {

  public static final String RUNS_IN_SERVER = "server";
  public static final String RUNS_IN_BROWSER = "browser";
}
