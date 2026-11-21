package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 18, list_genres: genres with their score counts. */
@Component
public class ListGenresTool implements CoachToolHandler {

  private final CoachRows rows;
  private final LibraryData library;

  public ListGenresTool(CoachRows rows, LibraryData library) {
    this.rows = rows;
    this.library = library;
  }

  @Override
  public String name() {
    return "list_genres";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int limit = args.integer("limit", 30);
    List<ScoreGenreBrowseGet200ResponseInner> found = library.genres(rows.user(principal), args.integer("offset", 0), limit,
      args.string("key"), args.number("gradeMin"), args.number("gradeMax"));
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("genres", found.stream().filter(g -> g.getGenre() != null).map(g -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("name", CoachRows.cut(g.getGenre().getName(), CoachRows.TEXT_CAP));
      m.put("slug", g.getGenre().getSlug());
      m.put("scoreCount", g.getCount());
      m.put("url", rows.genreUrl(g.getGenre().getSlug()));
      return m;
    }).toList());
    data.put("hasMore", found.size() == limit);
    return data;
  }
}
