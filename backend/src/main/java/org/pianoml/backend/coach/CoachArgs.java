package org.pianoml.backend.coach;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;

/** Typed access to tool arguments already validated against their schema (coach, issue #414). */
public final class CoachArgs {

  private final Map<String, Object> values;

  public CoachArgs(Map<String, Object> values) {
    this.values = values == null ? Map.of() : values;
  }

  public boolean has(String name) {
    return values.get(name) != null;
  }

  public String string(String name) {
    Object value = values.get(name);
    return value == null ? null : value.toString();
  }

  public int integer(String name, int defaultValue) {
    Object value = values.get(name);
    return value instanceof Number n ? n.intValue() : defaultValue;
  }

  public Integer integer(String name) {
    Object value = values.get(name);
    return value instanceof Number n ? n.intValue() : null;
  }

  public Double number(String name) {
    Object value = values.get(name);
    return value instanceof Number n ? n.doubleValue() : null;
  }

  public Boolean bool(String name) {
    Object value = values.get(name);
    return value instanceof Boolean b ? b : null;
  }

  public UUID uuid(String name) {
    String value = string(name);
    if (value == null) {
      return null;
    }
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException e) {
      throw CoachToolException.invalidArgument("The argument '" + name + "' must be a UUID.");
    }
  }

  /** The IANA time zone argument, checked; null when absent. */
  public String timeZone(String name) {
    String value = string(name);
    if (value == null || value.isBlank()) {
      return null;
    }
    try {
      return ZoneId.of(value).getId();
    } catch (DateTimeException e) {
      throw CoachToolException.invalidArgument("The argument '" + name + "' must be an IANA time zone, for example Europe/Paris.");
    }
  }
}
