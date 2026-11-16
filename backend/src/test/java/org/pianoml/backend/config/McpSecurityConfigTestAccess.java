package org.pianoml.backend.config;

import jakarta.servlet.Filter;

import java.util.List;

/** Gives tests in other packages the package-private Origin filter of {@link McpSecurityConfig}. */
public final class McpSecurityConfigTestAccess {

  private McpSecurityConfigTestAccess() {
  }

  public static Filter originFilter(List<String> allowedOrigins) {
    return new McpSecurityConfig.OriginFilter(allowedOrigins);
  }
}
