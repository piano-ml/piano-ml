package org.pianoml.backend.coach;

import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpStatelessServerFeatures;
import io.modelcontextprotocol.spec.McpError;
import io.modelcontextprotocol.spec.McpSchema;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerResponse;
import org.springframework.ai.mcp.server.webmvc.transport.WebMvcStatelessServerTransport;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * The MCP endpoint of the coach (issue #414): stateless Streamable HTTP at POST /mcp, tools from the contract
 * file, every call through {@link CoachToolDispatcher}. Authentication is the /mcp security chain
 * ({@link org.pianoml.backend.config.McpSecurityConfig}).
 *
 * <p>Tool handlers run on a Reactor thread, where SecurityContextHolder and every thread-local are empty. The
 * grant is read from the request by the context extractor, on the request thread, and handed to the handler
 * through the transport context. Never read the security context in tool code.
 */
@Slf4j
@Configuration
public class McpServerConfig {

  static final String ENDPOINT = "/mcp";
  static final String PRINCIPAL = "principal";
  static final String INSTRUCTIONS = "coach/instructions.md";

  /**
   * The server is built here, in the same bean method as the router function: with lazy initialization a
   * separate server bean would never be created and the transport would have no handler.
   */
  @Bean
  public RouterFunction<ServerResponse> mcpRouterFunction(CoachToolDispatcher dispatcher, CoachPromptCatalog prompts) {
    WebMvcStatelessServerTransport transport = WebMvcStatelessServerTransport.builder()
      .messageEndpoint(ENDPOINT)
      .contextExtractor(request -> request.servletRequest().getAttribute(GrantPrincipal.REQUEST_ATTRIBUTE) instanceof GrantPrincipal p
        ? McpTransportContext.create(Map.of(PRINCIPAL, p))
        : McpTransportContext.EMPTY)
      .build();

    List<McpStatelessServerFeatures.SyncToolSpecification> tools = dispatcher.registeredTools().stream()
      .map(definition -> toolSpecification(definition, dispatcher))
      .toList();

    McpServer.sync(transport)
      .serverInfo("pianoml", "1")
      .instructions(instructions())
      .capabilities(McpSchema.ServerCapabilities.builder().tools(false).prompts(false).build())
      // Arguments are checked by the dispatcher, which answers INVALID_ARGUMENT in the result envelope
      .validateToolInputs(false)
      .tools(tools)
      .prompts(prompts.all().stream().map(prompt -> promptSpecification(prompt, prompts)).toList())
      .build();
    log.info("Coach MCP server: {} tool(s), {} prompt(s) at {}", tools.size(), prompts.all().size(), ENDPOINT);
    return transport.getRouterFunction();
  }

  private static McpStatelessServerFeatures.SyncToolSpecification toolSpecification(CoachToolDefinition definition,
                                                                                   CoachToolDispatcher dispatcher) {
    McpSchema.Tool tool = McpSchema.Tool.builder()
      .name(definition.name())
      .description(definition.description())
      .inputSchema(definition.inputSchema())
      .build();
    return new McpStatelessServerFeatures.SyncToolSpecification(tool, (context, request) -> {
      if (!(context.get(PRINCIPAL) instanceof GrantPrincipal principal)) {
        // The /mcp chain only lets authenticated grants through: this would be a wiring bug
        throw new IllegalStateException("No grant on an MCP tool call");
      }
      CoachToolResult result = dispatcher.call(principal, definition.name(), request.arguments());
      return McpSchema.CallToolResult.builder()
        .addTextContent(dispatcher.toJson(result))
        .isError(!result.ok())
        .build();
    });
  }

  private static McpStatelessServerFeatures.SyncPromptSpecification promptSpecification(CoachPromptCatalog.Prompt prompt,
                                                                                      CoachPromptCatalog catalog) {
    List<McpSchema.PromptArgument> arguments = prompt.arguments().stream()
      .map(a -> new McpSchema.PromptArgument(a.name(), a.description(), a.required()))
      .toList();
    return new McpStatelessServerFeatures.SyncPromptSpecification(
      new McpSchema.Prompt(prompt.id(), prompt.title(), prompt.description(), arguments),
      (context, request) -> {
        String text;
        try {
          text = catalog.render(prompt, request.arguments());
        } catch (CoachPromptCatalog.MissingArgumentException e) {
          throw McpError.builder(McpSchema.ErrorCodes.INVALID_PARAMS).message(e.getMessage()).build();
        }
        return new McpSchema.GetPromptResult(prompt.description(),
          List.of(new McpSchema.PromptMessage(McpSchema.Role.USER, new McpSchema.TextContent(text))));
      });
  }

  static String instructions() {
    try (InputStream in = new ClassPathResource(INSTRUCTIONS).getInputStream()) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot read " + INSTRUCTIONS, e);
    }
  }

  /**
   * Deletes the audit rows older than {@code coach.audit.retention} every day. A plain idempotent DELETE, so
   * several instances may run it at once. Not in the {@code job} profile.
   */
  @Slf4j
  @Component
  @Lazy(false) // spring.main.lazy-initialization would otherwise never create it, and never schedule the job
  @Profile("!job")
  @EnableScheduling
  public static class CoachAuditRetention {

    private final CoachAuditService audit;

    public CoachAuditRetention(CoachAuditService audit) {
      this.audit = audit;
    }

    @Scheduled(cron = "${coach.audit.retention.cron:0 37 3 * * *}", zone = "UTC")
    public void purge() {
      try {
        audit.purge();
      } catch (RuntimeException e) {
        log.warn("Coach audit purge failed: {}", e.toString());
      }
    }
  }
}
