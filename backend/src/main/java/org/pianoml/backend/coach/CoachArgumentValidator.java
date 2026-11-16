package org.pianoml.backend.coach;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Checks tool arguments against the flat JSON schemas of openapi/coach-tools.json (coach, issue #414): an object
 * with no unknown property, required properties present, and per property its type (string, integer, number,
 * boolean), enum, minimum, maximum, minLength, maxLength, pattern and the uuid format. Nothing more: the schemas
 * use nothing more.
 */
public final class CoachArgumentValidator {

  private CoachArgumentValidator() {
  }

  /** @return the reason the arguments are invalid, for the model; empty when they are valid */
  @SuppressWarnings("unchecked")
  public static Optional<String> validate(Map<String, Object> schema, Map<String, Object> arguments) {
    Map<String, Object> properties = (Map<String, Object>) schema.getOrDefault("properties", Map.of());
    Map<String, Object> args = arguments == null ? Map.of() : arguments;
    for (String name : args.keySet()) {
      if (!properties.containsKey(name)) {
        return Optional.of("Unknown argument '" + name + "'. Known arguments: " + properties.keySet() + ".");
      }
    }
    for (Object required : (List<Object>) schema.getOrDefault("required", List.of())) {
      if (args.get(required) == null) {
        return Optional.of("The argument '" + required + "' is required.");
      }
    }
    for (Map.Entry<String, Object> entry : args.entrySet()) {
      if (entry.getValue() == null) {
        continue;
      }
      Optional<String> problem = check(entry.getKey(), (Map<String, Object>) properties.get(entry.getKey()), entry.getValue());
      if (problem.isPresent()) {
        return problem;
      }
    }
    return Optional.empty();
  }

  private static Optional<String> check(String name, Map<String, Object> property, Object value) {
    String type = String.valueOf(property.get("type"));
    switch (type) {
      case "string" -> {
        if (!(value instanceof String s)) {
          return Optional.of("The argument '" + name + "' must be a string.");
        }
        if (property.get("enum") instanceof List<?> values && !values.contains(s)) {
          return Optional.of("The argument '" + name + "' must be one of " + values + ".");
        }
        if (property.get("minLength") instanceof Number min && s.length() < min.intValue()) {
          return Optional.of("The argument '" + name + "' must have at least " + min + " characters.");
        }
        if (property.get("maxLength") instanceof Number max && s.length() > max.intValue()) {
          return Optional.of("The argument '" + name + "' must have at most " + max + " characters.");
        }
        if (property.get("pattern") instanceof String pattern && !Pattern.compile(pattern).matcher(s).find()) {
          return Optional.of("The argument '" + name + "' has an invalid format.");
        }
        if ("uuid".equals(property.get("format"))) {
          try {
            UUID.fromString(s);
          } catch (IllegalArgumentException e) {
            return Optional.of("The argument '" + name + "' must be a UUID.");
          }
        }
        return Optional.empty();
      }
      case "integer", "number" -> {
        if (!(value instanceof Number n)) {
          return Optional.of("The argument '" + name + "' must be a number.");
        }
        BigDecimal number = new BigDecimal(n.toString());
        if ("integer".equals(type) && number.stripTrailingZeros().scale() > 0) {
          return Optional.of("The argument '" + name + "' must be an integer.");
        }
        if (property.get("minimum") instanceof Number min && number.compareTo(new BigDecimal(min.toString())) < 0) {
          return Optional.of("The argument '" + name + "' must be at least " + min + ".");
        }
        if (property.get("maximum") instanceof Number max && number.compareTo(new BigDecimal(max.toString())) > 0) {
          return Optional.of("The argument '" + name + "' must be at most " + max + ".");
        }
        return Optional.empty();
      }
      case "boolean" -> {
        return value instanceof Boolean ? Optional.empty() : Optional.of("The argument '" + name + "' must be true or false.");
      }
      default -> {
        return Optional.of("The argument '" + name + "' has an unsupported type.");
      }
    }
  }
}
