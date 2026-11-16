package org.pianoml.backend.coach;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The ready-made prompts of openapi/coach-prompts.json, packaged as classpath:coach/coach-prompts.json (coach,
 * issue #414). Served by GET /coach/prompts and as MCP prompts.
 */
@Component
public class CoachPromptCatalog {

  static final String RESOURCE = "coach/coach-prompts.json";
  static final int MAX_ARGUMENT_LENGTH = 200;
  private static final Pattern PLACEHOLDER = Pattern.compile("\\{([A-Za-z][A-Za-z0-9_]*)}");

  public record Argument(String name, String description, boolean required, String defaultValue) {
    @com.fasterxml.jackson.annotation.JsonCreator
    public Argument(@com.fasterxml.jackson.annotation.JsonProperty("name") String name,
                    @com.fasterxml.jackson.annotation.JsonProperty("description") String description,
                    @com.fasterxml.jackson.annotation.JsonProperty("required") boolean required,
                    @com.fasterxml.jackson.annotation.JsonProperty("default") String defaultValue) {
      this.name = name;
      this.description = description;
      this.required = required;
      this.defaultValue = defaultValue;
    }
  }

  public record Prompt(String id, String title, String description, List<Argument> arguments, String text) {
  }

  /** A required argument is missing. */
  public static class MissingArgumentException extends RuntimeException {
    public MissingArgumentException(String prompt, String argument) {
      super("The prompt " + prompt + " needs the argument '" + argument + "'.");
    }
  }

  private final Map<String, Prompt> prompts;

  @Autowired
  public CoachPromptCatalog(ObjectMapper objectMapper) {
    List<Prompt> list;
    try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
      list = objectMapper.readValue(in, new TypeReference<List<Prompt>>() { });
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot read " + RESOURCE, e);
    }
    this.prompts = validate(list);
  }

  /** For tests: a catalog of the given prompts, validated the same way. */
  CoachPromptCatalog(List<Prompt> prompts) {
    this.prompts = validate(prompts);
  }

  public List<Prompt> all() {
    return List.copyOf(prompts.values());
  }

  public Optional<Prompt> find(String id) {
    return Optional.ofNullable(prompts.get(id));
  }

  /**
   * The prompt text with its placeholders replaced: by the given value as plain text (line breaks removed, cut at
   * 200 characters), else by the default.
   *
   * @throws MissingArgumentException when a required argument has no value
   */
  public String render(Prompt prompt, Map<String, ?> values) {
    Map<String, String> resolved = new LinkedHashMap<>();
    for (Argument argument : prompt.arguments()) {
      Object raw = values == null ? null : values.get(argument.name());
      String value = raw == null ? "" : sanitize(raw.toString());
      if (value.isEmpty()) {
        if (argument.required()) {
          throw new MissingArgumentException(prompt.id(), argument.name());
        }
        value = argument.defaultValue() == null ? "" : argument.defaultValue();
      }
      resolved.put(argument.name(), value);
    }
    Matcher m = PLACEHOLDER.matcher(prompt.text());
    StringBuilder out = new StringBuilder();
    while (m.find()) {
      m.appendReplacement(out, Matcher.quoteReplacement(resolved.getOrDefault(m.group(1), m.group())));
    }
    m.appendTail(out);
    return out.toString();
  }

  static String sanitize(String value) {
    String oneLine = value.replaceAll("[\\r\\n\\u2028\\u2029]+", " ").strip();
    return oneLine.length() > MAX_ARGUMENT_LENGTH ? oneLine.substring(0, MAX_ARGUMENT_LENGTH) : oneLine;
  }

  private static Map<String, Prompt> validate(List<Prompt> list) {
    Map<String, Prompt> byId = new LinkedHashMap<>();
    for (Prompt prompt : list) {
      if (prompt.id() == null || prompt.text() == null || byId.put(prompt.id(), prompt) != null) {
        throw new IllegalStateException(RESOURCE + ": missing or duplicate prompt id " + prompt.id());
      }
      Set<String> declared = prompt.arguments() == null ? Set.of()
        : prompt.arguments().stream().map(Argument::name).collect(Collectors.toSet());
      Set<String> used = new HashSet<>();
      Matcher m = PLACEHOLDER.matcher(prompt.text());
      while (m.find()) {
        used.add(m.group(1));
      }
      if (!declared.containsAll(used)) {
        used.removeAll(declared);
        throw new IllegalStateException(RESOURCE + ": prompt " + prompt.id() + " uses undeclared placeholders " + used);
      }
    }
    return byId;
  }
}
