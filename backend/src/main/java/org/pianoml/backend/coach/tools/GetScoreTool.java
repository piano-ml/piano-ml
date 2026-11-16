package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 11, get_score. */
@Component
public class GetScoreTool implements CoachToolHandler {

  private final CoachRows rows;
  private final LibraryData library;

  public GetScoreTool(CoachRows rows, LibraryData library) {
    this.rows = rows;
    this.library = library;
  }

  @Override
  public String name() {
    return "get_score";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    ScoreApiInfo score = library.score(new CoachArgs(arguments));
    List<HarmonyEntry> harmony = CoachRows.present(score.getHarmony());
    List<YoutubeLink> videos = CoachRows.present(score.getYoutubeLinks());
    Map<String, Object> data = rows.scoreRow(score);
    data.put("description", CoachRows.cut(score.getDescription(), CoachRows.TEXT_CAP));
    data.put("publicDomain", score.getPublicDomain());
    data.put("tracksCount", score.getTracksCount());
    data.put("hasHarmony", harmony != null && !harmony.isEmpty());
    data.put("videoCount", videos == null ? 0 : videos.size());
    data.put("uploadedAt", CoachRows.iso(score.getUploadedAt()));
    return data;
  }
}
