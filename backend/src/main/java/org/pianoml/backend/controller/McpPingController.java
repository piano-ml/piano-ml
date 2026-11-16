package org.pianoml.backend.controller;

import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.TreeSet;

/**
 * Temporary placeholder for the MCP endpoint (coach, issue #414, phase 1): proves that a grant token
 * authenticates on /mcp/**. Replaced by the MCP server in phase 2.
 */
@RestController
public class McpPingController {

  @GetMapping("/mcp/ping")
  public Map<String, Object> ping() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    GrantPrincipal principal = (GrantPrincipal) authentication.getPrincipal();
    return Map.of("grant", principal.clientName(), "scopes", new TreeSet<>(principal.scopes()));
  }
}
