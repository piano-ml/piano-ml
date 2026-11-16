package org.pianoml.backend.coach;

import org.pianoml.backend.service.CoachGrantService;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The tools of the contract file openapi/coach-tools.json, packaged as classpath:coach/coach-tools.json (coach, issue
 * #414). The same file drives the frontend's browser tools, so names, descriptions and schemas have one source.
 */
@Component
public class CoachToolCatalog {

  static final String RESOURCE = "coach/coach-tools.json";
  private static final Set<String> RUNS_IN = Set.of(CoachToolDefinition.RUNS_IN_SERVER, CoachToolDefinition.RUNS_IN_BROWSER);

  private final Map<String, CoachToolDefinition> tools;

  public CoachToolCatalog(ObjectMapper objectMapper) {
    this.tools = load(objectMapper);
  }

  public List<CoachToolDefinition> all() {
    return List.copyOf(tools.values());
  }

  public Optional<CoachToolDefinition> find(String name) {
    return Optional.ofNullable(tools.get(name));
  }

  private static Map<String, CoachToolDefinition> load(ObjectMapper objectMapper) {
    List<CoachToolDefinition> list;
    try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
      list = objectMapper.readValue(in, new TypeReference<List<CoachToolDefinition>>() { });
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot read " + RESOURCE, e);
    }
    Map<String, CoachToolDefinition> byName = new LinkedHashMap<>();
    for (CoachToolDefinition tool : list) {
      if (tool.name() == null || byName.put(tool.name(), tool) != null) {
        throw new IllegalStateException(RESOURCE + ": missing or duplicate tool name " + tool.name());
      }
      if (!RUNS_IN.contains(tool.runsIn()) || tool.scopes() == null || !CoachGrantService.SCOPES.containsAll(tool.scopes())
        || tool.description() == null || tool.inputSchema() == null || !"object".equals(tool.inputSchema().get("type"))) {
        throw new IllegalStateException(RESOURCE + ": invalid definition of " + tool.name());
      }
    }
    return byName;
  }
}
