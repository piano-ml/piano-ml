package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 14, list_my_scores: the scores the student uploaded, newest first. */
@Component
public class ListMyScoresTool implements CoachToolHandler {

  private final CoachRows rows;
  private final LibraryData library;

  public ListMyScoresTool(CoachRows rows, LibraryData library) {
    this.rows = rows;
    this.library = library;
  }

  @Override
  public String name() {
    return "list_my_scores";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int limit = args.integer("limit", 10);
    User user = rows.user(principal);
    List<ScoreApiInfo> found = library.search(user, null, LibraryData.userId(user), null, null, null, null, null, null, null,
      "uploadedAt_desc", args.integer("offset", 0), limit);
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("scores", found.stream().map(rows::scoreRow).toList());
    data.put("hasMore", found.size() == limit);
    return data;
  }
}
