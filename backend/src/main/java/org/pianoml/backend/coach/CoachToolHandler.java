package org.pianoml.backend.coach;

import org.pianoml.backend.security.GrantPrincipal;

import java.util.Map;

/**
 * A tool executed on the server (coach, issue #414). The dispatcher has already checked the scopes, the
 * arguments against the schema of the contract file and the rate limit. The user is always
 * {@code principal.userId()}: no argument can name another user.
 */
public interface CoachToolHandler {

  /** The tool name, as in openapi/coach-tools.json. */
  String name();

  /**
   * @return the {@code data} of a successful result (maps, lists and simple values)
   * @throws CoachToolException for a refusal the model should see
   */
  Object execute(GrantPrincipal principal, Map<String, Object> arguments);
}
