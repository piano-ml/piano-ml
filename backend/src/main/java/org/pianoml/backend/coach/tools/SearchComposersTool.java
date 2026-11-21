package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 16, search_composers: by part of the name, at most 20. */
@Component
public class SearchComposersTool implements CoachToolHandler {

  private final CoachRows rows;
  private final LibraryData library;

  public SearchComposersTool(CoachRows rows, LibraryData library) {
    this.rows = rows;
    this.library = library;
  }

  @Override
  public String name() {
    return "search_composers";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    String query = new CoachArgs(arguments).string("query").strip();
    if (query.length() < 2) {
      throw CoachToolException.invalidArgument("The query must have at least 2 characters.");
    }
    return Map.of("composers", library.searchComposers(query).stream().limit(20)
      .map(a -> ListComposersTool.composer(rows, a)).toList());
  }
}
