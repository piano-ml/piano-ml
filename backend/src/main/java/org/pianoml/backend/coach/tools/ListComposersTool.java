package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 15, list_composers: composers with their score counts. */
@Component
public class ListComposersTool implements CoachToolHandler {

  private final CoachRows rows;
  private final LibraryData library;

  public ListComposersTool(CoachRows rows, LibraryData library) {
    this.rows = rows;
    this.library = library;
  }

  @Override
  public String name() {
    return "list_composers";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    int limit = args.integer("limit", 20);
    List<AuthorWithScoreCount> found = library.composers(rows.user(principal), args.integer("offset", 0), limit,
      args.string("key"), null, args.number("gradeMin"), args.number("gradeMax"));
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("composers", found.stream().map(c -> {
      Map<String, Object> m = composer(rows, c.getAuthor());
      m.put("scoreCount", c.getCount());
      return m;
    }).toList());
    data.put("hasMore", found.size() == limit);
    return data;
  }

  /** name, slug, country, life span and link of a composer. */
  static Map<String, Object> composer(CoachRows rows, AuthorApiInfo a) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("name", CoachRows.cut(a.getName(), CoachRows.TEXT_CAP));
    m.put("slug", a.getSlug());
    m.put("country", a.getCountry());
    m.put("lifeSpanBegin", CoachRows.iso(a.getLifeSpanBegin()));
    m.put("lifeSpanEnd", CoachRows.iso(a.getLifeSpanEnd()));
    m.put("url", rows.composerUrl(a.getSlug()));
    return m;
  }
}
