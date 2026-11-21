package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 10, search_scores: GET /score/search for the grant's user. */
@Component
public class SearchScoresTool implements CoachToolHandler {

  private final CoachRows rows;
  private final LibraryData library;

  public SearchScoresTool(CoachRows rows, LibraryData library) {
    this.rows = rows;
    this.library = library;
  }

  @Override
  public String name() {
    return "search_scores";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int limit = args.integer("limit", 10);
    String authorId = null;
    if (args.has("composer")) {
      Optional<String> id = library.composerIdByName(args.string("composer"));
      if (id.isEmpty()) {
        return Map.of("scores", List.of(), "hasMore", false);
      }
      authorId = id.get();
    }
    List<ScoreApiInfo> found = library.search(rows.user(principal), args.string("keyword"), null, authorId,
      args.string("composerSlug"), args.string("genreSlug"),
      Boolean.TRUE.equals(args.bool("studiesOnly")) ? Boolean.TRUE : null,
      args.number("gradeMin"), args.number("gradeMax"), args.string("key"), args.string("sort"),
      args.integer("offset", 0), limit);
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("scores", found.stream().map(rows::scoreRow).toList());
    data.put("hasMore", found.size() == limit);
    return data;
  }
}
