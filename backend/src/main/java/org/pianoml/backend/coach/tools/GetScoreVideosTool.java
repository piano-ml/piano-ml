package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 13, get_score_videos: the links stored on the score, best rank first. No outbound call. */
@Component
public class GetScoreVideosTool implements CoachToolHandler {

  private final LibraryData library;

  public GetScoreVideosTool(LibraryData library) {
    this.library = library;
  }

  @Override
  public String name() {
    return "get_score_videos";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    List<YoutubeLink> links = CoachRows.present(library.score(new CoachArgs(arguments)).getYoutubeLinks());
    return Map.of("videos", (links == null ? List.<YoutubeLink>of() : links).stream()
      .filter(l -> l.getUrl() != null)
      .sorted(Comparator.comparing(YoutubeLink::getRank, Comparator.nullsLast(Comparator.naturalOrder())))
      .limit(10)
      .map(l -> {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("url", l.getUrl().toString());
        m.put("rank", l.getRank());
        return m;
      }).toList());
  }
}
