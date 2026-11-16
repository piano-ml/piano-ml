package org.pianoml.backend.coach;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Sends MCP JSON-RPC messages to POST /mcp in tests (coach, issue #414). */
public class McpTestClient {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final AtomicInteger IDS = new AtomicInteger();

  private final MockMvc mockMvc;

  public McpTestClient(MockMvc mockMvc) {
    this.mockMvc = mockMvc;
  }

  /** The raw HTTP exchange, to assert on the status (401, 403...). */
  public ResultActions send(String token, String method, Map<String, Object> params) throws Exception {
    Map<String, Object> message = new LinkedHashMap<>();
    message.put("jsonrpc", "2.0");
    message.put("id", IDS.incrementAndGet());
    message.put("method", method);
    message.put("params", params);
    var request = post("/mcp")
      .contentType(MediaType.APPLICATION_JSON)
      .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
      .content(JSON.writeValueAsString(message));
    if (token != null) {
      request.header("Authorization", "Bearer " + token);
    }
    ResultActions result = mockMvc.perform(request);
    var mvc = result.andReturn();
    return mvc.getRequest().isAsyncStarted() ? mockMvc.perform(asyncDispatch(mvc)) : result;
  }

  /** The JSON-RPC response of a successful exchange. */
  public JsonNode rpc(String token, String method, Map<String, Object> params) throws Exception {
    String body = send(token, method, params).andReturn().getResponse().getContentAsString();
    return JSON.readTree(body);
  }

  public JsonNode listTools(String token) throws Exception {
    return rpc(token, "tools/list", Map.of()).path("result").path("tools");
  }

  /** A tools/call; returns the envelope (ok, data or code, message) parsed from the text content. */
  public JsonNode call(String token, String tool, Map<String, Object> arguments) throws Exception {
    JsonNode response = rpc(token, "tools/call", Map.of("name", tool, "arguments", arguments));
    JsonNode result = response.path("result");
    if (result.isMissingNode()) {
      throw new AssertionError("No result in " + response);
    }
    JsonNode envelope = JSON.readTree(result.path("content").get(0).path("text").asText());
    if (result.path("isError").asBoolean() == envelope.path("ok").asBoolean()) {
      throw new AssertionError("isError does not match ok in " + response);
    }
    return envelope;
  }

  public JsonNode data(String token, String tool, Map<String, Object> arguments) throws Exception {
    JsonNode envelope = call(token, tool, arguments);
    if (!envelope.path("ok").asBoolean()) {
      throw new AssertionError(tool + " failed: " + envelope);
    }
    return envelope.path("data");
  }
}
