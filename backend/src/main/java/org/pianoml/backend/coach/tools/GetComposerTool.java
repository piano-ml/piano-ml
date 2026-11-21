package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 17, get_composer. */
@Component
public class GetComposerTool implements CoachToolHandler {

  static final int BIOGRAPHY_CAP = 1500;

  private final CoachRows rows;
  private final LibraryData library;

  public GetComposerTool(CoachRows rows, LibraryData library) {
    this.rows = rows;
    this.library = library;
  }

  @Override
  public String name() {
    return "get_composer";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    String slug = new CoachArgs(arguments).string("slug");
    AuthorWithScoreCount found = library.composers(rows.user(principal), 0, 1, null, slug, null, null).stream()
      .filter(c -> c.getAuthor() != null && slug.equals(c.getAuthor().getSlug()))
      .findFirst()
      .orElseThrow(() -> new CoachToolException("COMPOSER_NOT_FOUND",
        "No composer with this slug in the library. Use search_composers to find one."));
    AuthorApiInfo a = found.getAuthor();
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("name", CoachRows.cut(a.getName(), CoachRows.TEXT_CAP));
    data.put("slug", a.getSlug());
    data.put("sortName", a.getSortName());
    data.put("country", a.getCountry());
    data.put("type", a.getType());
    data.put("lifeSpanBegin", CoachRows.iso(a.getLifeSpanBegin()));
    data.put("lifeSpanEnd", CoachRows.iso(a.getLifeSpanEnd()));
    data.put("biography", CoachRows.cut(a.getDescription(), BIOGRAPHY_CAP));
    data.put("bioLink", a.getComposerBioLink() == null ? null : a.getComposerBioLink().toString());
    data.put("scoreCount", found.getCount());
    data.put("url", rows.composerUrl(a.getSlug()));
    return data;
  }
}
