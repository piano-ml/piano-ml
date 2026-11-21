package org.pianoml.backend.coach;

import org.junit.jupiter.api.Test;
import org.pianoml.backend.security.GrantPrincipal;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The argument validator, the dispatcher's order and output cap, and the rate limiter (coach, issue #414). */
class CoachToolFrameworkTest {

  private static final Map<String, Object> SCHEMA = Map.of(
    "type", "object",
    "properties", Map.of(
      "limit", Map.of("type", "integer", "minimum", 1, "maximum", 20),
      "grade", Map.of("type", "number", "minimum", 0, "maximum", 8),
      "sort", Map.of("type", "string", "enum", List.of("a", "b")),
      "query", Map.of("type", "string", "minLength", 2, "maxLength", 5),
      "slug", Map.of("type", "string", "pattern", "^[a-z-]+$"),
      "id", Map.of("type", "string", "format", "uuid"),
      "flag", Map.of("type", "boolean")),
    "required", List.of("limit"),
    "additionalProperties", false);

  private static boolean valid(Map<String, Object> args) {
    return CoachArgumentValidator.validate(SCHEMA, args).isEmpty();
  }

  @Test
  void validator_acceptsValidArguments() {
    assertThat(valid(Map.of("limit", 5))).isTrue();
    assertThat(valid(Map.of("limit", 5.0, "grade", 2.5, "sort", "a", "query", "ab", "slug", "a-b",
      "id", UUID.randomUUID().toString(), "flag", true))).isTrue();
  }

  @Test
  void validator_refusesEachKindOfInvalidArgument() {
    assertThat(valid(Map.of())).isFalse(); // required
    assertThat(valid(Map.of("limit", 5, "userId", "x"))).isFalse(); // unknown
    assertThat(valid(Map.of("limit", 0))).isFalse();
    assertThat(valid(Map.of("limit", 21))).isFalse();
    assertThat(valid(Map.of("limit", 1.5))).isFalse(); // not an integer
    assertThat(valid(Map.of("limit", "5"))).isFalse(); // not a number
    assertThat(valid(Map.of("limit", 5, "grade", 8.5))).isFalse();
    assertThat(valid(Map.of("limit", 5, "sort", "c"))).isFalse();
    assertThat(valid(Map.of("limit", 5, "query", "a"))).isFalse();
    assertThat(valid(Map.of("limit", 5, "query", "abcdef"))).isFalse();
    assertThat(valid(Map.of("limit", 5, "slug", "a/b"))).isFalse();
    assertThat(valid(Map.of("limit", 5, "id", "nope"))).isFalse();
    assertThat(valid(Map.of("limit", 5, "flag", "true"))).isFalse();
  }

  private static final GrantPrincipal READER =
    new GrantPrincipal(UUID.randomUUID(), UUID.randomUUID(), "host", Set.of("practice:read"));

  private CoachToolDispatcher dispatcher(CoachToolHandler handler, CoachRateLimiter limiter, CoachAuditService audit) {
    CoachToolCatalog catalog = mock(CoachToolCatalog.class);
    CoachToolDefinition definition = new CoachToolDefinition(handler.name(), "server", List.of("practice:read"), 10, "d", SCHEMA);
    when(catalog.find(handler.name())).thenReturn(java.util.Optional.of(definition));
    when(catalog.all()).thenReturn(List.of(definition));
    return new CoachToolDispatcher(catalog, List.of(handler), limiter, audit, tools.jackson.databind.json.JsonMapper.builder().build());
  }

  private static CoachToolHandler handler(java.util.function.Supplier<Object> body) {
    return new CoachToolHandler() {
      public String name() {
        return "t";
      }

      public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
        return body.get();
      }
    };
  }

  private static CoachRateLimiter unlimited() {
    CoachRateLimiter limiter = mock(CoachRateLimiter.class);
    when(limiter.tryAcquire(any())).thenReturn(true);
    return limiter;
  }

  @Test
  void dispatcher_checksScopeThenArgumentsThenRate_andAuditsEveryOutcome() {
    CoachAuditService audit = mock(CoachAuditService.class);
    CoachRateLimiter limiter = mock(CoachRateLimiter.class);
    when(limiter.tryAcquire(any())).thenReturn(false);
    CoachToolDispatcher d = dispatcher(handler(() -> "data"), limiter, audit);

    GrantPrincipal noScope = new GrantPrincipal(UUID.randomUUID(), UUID.randomUUID(), "host", Set.of("scores:read"));
    assertThat(d.call(noScope, "t", Map.of("limit", 1)).code()).isEqualTo("FORBIDDEN_SCOPE");
    assertThat(d.call(READER, "t", Map.of()).code()).isEqualTo("INVALID_ARGUMENT");
    assertThat(d.call(READER, "t", Map.of("limit", 1)).code()).isEqualTo("RATE_LIMITED");
    assertThat(d.call(READER, "unknown", Map.of()).code()).isEqualTo("INVALID_ARGUMENT");
    verify(audit).record(eq(noScope), eq("t"), eq("FORBIDDEN_SCOPE"), anyLong());
    verify(audit).record(eq(READER), eq("t"), eq("RATE_LIMITED"), anyLong());
  }

  @Test
  void dispatcher_turnsRefusalsAndCrashesIntoEnvelopes_withoutTheExceptionMessage() {
    CoachAuditService audit = mock(CoachAuditService.class);
    CoachToolDispatcher refusing = dispatcher(handler(() -> {
      throw new CoachToolException("SCORE_NOT_FOUND", "No such score.");
    }), unlimited(), audit);
    CoachToolResult refused = refusing.call(READER, "t", Map.of("limit", 1));
    assertThat(refused.ok()).isFalse();
    assertThat(refused.code()).isEqualTo("SCORE_NOT_FOUND");
    assertThat(refused.message()).isEqualTo("No such score.");

    CoachToolDispatcher crashing = dispatcher(handler(() -> {
      throw new IllegalStateException("secret detail");
    }), unlimited(), audit);
    CoachToolResult crashed = crashing.call(READER, "t", Map.of("limit", 1));
    assertThat(crashed.code()).isEqualTo("INTERNAL");
    assertThat(crashed.message()).isEqualTo("The tool failed.");
    assertThat(crashing.toJson(crashed)).doesNotContain("secret detail");
    verify(audit).record(eq(READER), eq("t"), eq("INTERNAL"), anyLong());
  }

  @Test
  void dispatcher_capsTheOutput() {
    CoachToolDispatcher d = dispatcher(handler(() -> "x".repeat(20_000)), unlimited(), mock(CoachAuditService.class));
    String json = d.toJson(d.call(READER, "t", Map.of("limit", 1)));
    assertThat(json).startsWith("{\"ok\":true,\"data\":{\"truncated\":true,\"text\":\"{\\\"ok\\\":true");
    assertThat(json.length()).isLessThan(CoachToolDispatcher.OUTPUT_CAP + 200);

    String small = d.toJson(CoachToolResult.success(Map.of("a", 1)));
    assertThat(small).isEqualTo("{\"ok\":true,\"data\":{\"a\":1}}");
  }

  @Test
  void rateLimiter_allowsSixtyCallsPerMinutePerGrant() {
    Instant now = Instant.parse("2026-11-16T10:00:05Z");
    CoachRateLimiter limiter = new CoachRateLimiter(60, Clock.fixed(now, ZoneOffset.UTC));
    UUID grant = UUID.randomUUID();
    for (int i = 0; i < 60; i++) {
      assertThat(limiter.tryAcquire(grant)).isTrue();
    }
    assertThat(limiter.tryAcquire(grant)).isFalse();
    assertThat(limiter.tryAcquire(UUID.randomUUID())).isTrue();
    CoachRateLimiter nextMinute = new CoachRateLimiter(60, Clock.fixed(now.plusSeconds(60), ZoneOffset.UTC));
    assertThat(nextMinute.tryAcquire(grant)).isTrue();
  }
}
