package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.coach.bridge.PlayerBridge;
import org.pianoml.backend.entity.CoachGrant;
import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.PracticeLevel;
import org.pianoml.backend.repository.CoachGrantRepository;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/** Tool 1, get_context: who the student is, what this connection may do, their level, connected tabs. */
@Component
public class GetContextTool implements CoachToolHandler {

  private final CoachRows rows;
  private final PracticeData practice;
  private final CoachGrantRepository grants;
  private final Clock clock;
  private final PlayerBridge bridge;

  public GetContextTool(CoachRows rows, PracticeData practice, CoachGrantRepository grants, Clock clock, PlayerBridge bridge) {
    this.bridge = bridge;
    this.rows = rows;
    this.practice = practice;
    this.grants = grants;
    this.clock = clock;
  }

  @Override
  public String name() {
    return "get_context";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    User user = rows.user(principal);
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("user", Map.of("name", user.getName()));

    Map<String, Object> grant = new LinkedHashMap<>();
    grant.put("name", principal.clientName());
    grant.put("scopes", List.copyOf(new TreeSet<>(principal.scopes())));
    grant.put("expiresAt", grants.findById(principal.grantId()).map(CoachGrant::getExpiresAt).map(CoachRows::iso).orElse(null));
    data.put("grant", grant);

    data.put("serverTime", CoachRows.iso(OffsetDateTime.now(clock)));
    List<PracticeSession> latest = practice.recent(user, 1, null, null);
    data.put("timeZone", latest.isEmpty() ? null : latest.get(0).getTimeZone());
    if (principal.hasScope("practice:read")) {
      PracticeLevel level = practice.summary(user, null).getLevel();
      Map<String, Object> levelMap = new LinkedHashMap<>();
      levelMap.put("highestGradeMastered", level == null ? null : level.getHighestGradeMastered());
      data.put("level", levelMap);
    }
    if (principal.hasScope("player:control")) {
      data.put("player", Map.of("connectedTabs", bridge.connectedTabs(user.getId())));
    }
    data.put("siteUrl", rows.siteUrl());
    data.put("connectUrl", rows.siteUrl() + "/coach/connect");
    return data;
  }
}
