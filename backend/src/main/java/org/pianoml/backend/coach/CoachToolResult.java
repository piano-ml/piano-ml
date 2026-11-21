package org.pianoml.backend.coach;

import java.util.LinkedHashMap;
import java.util.Map;

/** The envelope every tool returns (coach, issue #414): {@code { ok, data }} or {@code { ok, code, message }}. */
public record CoachToolResult(boolean ok, Object data, String code, String message) {

  public static CoachToolResult success(Object data) {
    return new CoachToolResult(true, data, null, null);
  }

  public static CoachToolResult error(String code, String message) {
    return new CoachToolResult(false, null, code, message);
  }

  /** The envelope as written to the model. */
  public Map<String, Object> toMap() {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("ok", ok);
    if (ok) {
      map.put("data", data);
    } else {
      map.put("code", code);
      map.put("message", message);
    }
    return map;
  }
}
