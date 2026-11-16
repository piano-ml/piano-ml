package org.pianoml.backend.coach;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Runs one tool call for a grant (coach, issue #414), in this order: scopes, arguments, rate limit, handler.
 * Every call ends as an envelope: a refusal becomes {@code { ok: false, code, message }}, an unexpected error
 * {@code INTERNAL} with a log line that holds no argument. The serialized envelope is capped, and each call is
 * audited.
 */
@Slf4j
@Component
public class CoachToolDispatcher {

  /** Above this many characters, a result is replaced by its truncated text. */
  public static final int OUTPUT_CAP = 16_000;

  private final CoachToolCatalog catalog;
  private final Map<String, CoachToolHandler> handlers;
  private final CoachRateLimiter rateLimiter;
  private final CoachAuditService audit;
  private final ObjectMapper objectMapper;

  public CoachToolDispatcher(CoachToolCatalog catalog, List<CoachToolHandler> handlers, CoachRateLimiter rateLimiter,
                             CoachAuditService audit, ObjectMapper objectMapper) {
    this.catalog = catalog;
    this.handlers = handlers.stream().collect(Collectors.toMap(CoachToolHandler::name, Function.identity()));
    this.rateLimiter = rateLimiter;
    this.audit = audit;
    this.objectMapper = objectMapper;
    for (String name : this.handlers.keySet()) {
      if (catalog.find(name).isEmpty()) {
        throw new IllegalStateException("Coach tool handler " + name + " is not in " + CoachToolCatalog.RESOURCE);
      }
    }
  }

  /** The tools served by the MCP endpoint: those of the catalog that have a handler, in catalog order. */
  public List<CoachToolDefinition> registeredTools() {
    return catalog.all().stream().filter(tool -> handlers.containsKey(tool.name())).toList();
  }

  /** Executes the call and returns the envelope. */
  public CoachToolResult call(GrantPrincipal principal, String name, Map<String, Object> arguments) {
    long start = System.nanoTime();
    CoachToolResult result = execute(principal, name, arguments);
    audit.record(principal, name, result.ok() ? "OK" : result.code(), (System.nanoTime() - start) / 1_000_000);
    return result;
  }

  /** The envelope as the JSON text sent to the model, capped at {@link #OUTPUT_CAP} characters. */
  public String toJson(CoachToolResult result) {
    String json = objectMapper.writeValueAsString(result.toMap());
    if (json.length() <= OUTPUT_CAP) {
      return json;
    }
    Map<String, Object> truncated = new LinkedHashMap<>();
    truncated.put("truncated", true);
    truncated.put("text", json.substring(0, OUTPUT_CAP));
    return objectMapper.writeValueAsString(CoachToolResult.success(truncated).toMap());
  }

  private CoachToolResult execute(GrantPrincipal principal, String name, Map<String, Object> arguments) {
    Optional<CoachToolDefinition> definition = catalog.find(name);
    CoachToolHandler handler = handlers.get(name);
    if (definition.isEmpty() || handler == null) {
      return CoachToolResult.error(CoachToolException.INVALID_ARGUMENT, "Unknown tool '" + name + "'.");
    }
    List<String> missing = definition.get().scopes().stream().filter(scope -> !principal.hasScope(scope)).toList();
    if (!missing.isEmpty()) {
      return CoachToolResult.error(CoachToolException.FORBIDDEN_SCOPE,
        "This connection is not allowed to use " + name + ": it needs the scope " + String.join(" and ", missing)
          + ". Tell the student to create an access with this scope in their PianoML account.");
    }
    Map<String, Object> args = arguments == null ? Map.of() : arguments;
    Optional<String> invalid = CoachArgumentValidator.validate(definition.get().inputSchema(), args);
    if (invalid.isPresent()) {
      return CoachToolResult.error(CoachToolException.INVALID_ARGUMENT, invalid.get());
    }
    if (!rateLimiter.tryAcquire(principal.grantId())) {
      return CoachToolResult.error(CoachToolException.RATE_LIMITED, "Too many calls in the last minute. Wait a minute, then try again.");
    }
    try {
      return CoachToolResult.success(handler.execute(principal, args));
    } catch (CoachToolException e) {
      return CoachToolResult.error(e.code(), e.getMessage());
    } catch (RuntimeException e) {
      // The exception class and where it was thrown, never its message: messages can carry argument values
      StackTraceElement where = e.getStackTrace().length > 0 ? e.getStackTrace()[0] : null;
      log.error("Coach tool {} failed for grant {}: {} at {}", name, principal.grantId(), e.getClass().getName(), where);
      return CoachToolResult.error(CoachToolException.INTERNAL, "The tool failed.");
    }
  }
}
