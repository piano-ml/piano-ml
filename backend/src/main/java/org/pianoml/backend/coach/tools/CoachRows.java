package org.pianoml.backend.coach.tools;

import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.PracticeItemStats;
import org.pianoml.backend.model.PracticeSessionApiInfo;
import org.pianoml.backend.model.ScoreApiInfo;
import org.openapitools.jackson.nullable.JsonNullable;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.temporal.Temporal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * The compact rows tools return (coach, issue #414, section 4.1 of the specification): ItemRow, SessionRow, and
 * the links to the site. Free text written by users is cut; dates are ISO-8601 strings.
 */
@Component
public class CoachRows {

  public static final int TEXT_CAP = 500;

  private final String siteUrl;
  private final UserRepository userRepository;

  public CoachRows(@Value("${coach.site-url:https://pianoml.org}") String siteUrl, UserRepository userRepository) {
    this.siteUrl = siteUrl.endsWith("/") ? siteUrl.substring(0, siteUrl.length() - 1) : siteUrl;
    this.userRepository = userRepository;
  }

  public String siteUrl() {
    return siteUrl;
  }

  /** The user the grant acts for. A grant of a deleted user cannot authenticate (cascade), so this always exists. */
  public User user(GrantPrincipal principal) {
    return userRepository.findById(principal.userId())
      .orElseThrow(() -> new IllegalStateException("No user for an authenticated grant"));
  }

  public String scoreUrl(String slug) {
    return slug == null ? null : siteUrl + "/score/" + slug;
  }

  public String practiceUrl(String slug) {
    return slug == null ? null : siteUrl + "/work/" + slug;
  }

  public static String cut(String text, int max) {
    return text == null || text.length() <= max ? text : text.substring(0, max);
  }

  public static String iso(Temporal value) {
    return value == null ? null : value.toString();
  }

  /** The value of an optional API field, or null. */
  public static <T> T present(JsonNullable<T> value) {
    return value != null && value.isPresent() ? value.get() : null;
  }

  public static String slugOf(ScoreApiInfo score) {
    return score.getImmutableSlug() != null ? score.getImmutableSlug() : score.getMutableSlug();
  }

  /** The compact score row of section 4.1. */
  public Map<String, Object> scoreRow(ScoreApiInfo score) {
    String slug = slugOf(score);
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", score.getId());
    row.put("slug", slug);
    row.put("title", cut(score.getTitle(), TEXT_CAP));
    row.put("author", cut(score.getAuthor(), TEXT_CAP));
    row.put("authorSlug", score.getAuthorSlug());
    row.put("grade", score.getGrade());
    row.put("key", score.getFullKey() != null ? score.getFullKey()
      : score.getTonic() != null && score.getMode() != null ? score.getTonic() + " " + score.getMode() : null);
    row.put("tempo", score.getTempo());
    row.put("measures", score.getMeasures());
    row.put("durationSeconds", score.getDuration() == null ? null : Math.round(score.getDuration()));
    row.put("genre", score.getGenre());
    row.put("genreSlug", score.getGenreSlug());
    row.put("handSeparated", score.getHandSeparated());
    // 1 track: usually the right hand only; 2 tracks: right hand then left hand (as the player plays them)
    row.put("tracksCount", score.getTracksCount());
    row.put("hasLyrics", score.getHasLyrics());
    row.put("playCount", score.getPlayCount());
    row.put("url", scoreUrl(slug));
    row.put("practiceUrl", practiceUrl(slug));
    return row;
  }

  public String composerUrl(String slug) {
    return slug == null ? null : siteUrl + "/library/artists/" + slug;
  }

  public String genreUrl(String slug) {
    return slug == null ? null : siteUrl + "/library/genres/" + slug;
  }

  /** One practiced score or exercise. */
  public Map<String, Object> itemRow(PracticeItemStats item) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("kind", item.getKind());
    row.put("scoreId", item.getScoreId() == null ? null : item.getScoreId().toString());
    row.put("slug", item.getSlug());
    row.put("title", cut(item.getTitle(), TEXT_CAP));
    row.put("author", cut(item.getAuthor(), TEXT_CAP));
    row.put("exerciseType", item.getExerciseType());
    row.put("patternKey", item.getPatternKey());
    row.put("exerciseKey", item.getExerciseKey());
    row.put("tonic", item.getTonic());
    row.put("mode", item.getMode());
    row.put("grade", item.getGrade());
    row.put("sessions", item.getSessions());
    row.put("activeSeconds", item.getActiveSeconds());
    row.put("lastPlayedAt", iso(item.getLastPlayedAt()));
    row.put("bestAccuracy", item.getBestAccuracy());
    row.put("lastAccuracy", item.getLastAccuracy());
    row.put("bestTempoFactor", item.getBestTempoFactor());
    row.put("hands", item.getHands());
    row.put("completedCount", item.getCompletedCount());
    row.put("coverage", item.getCoverage());
    row.put("stale", item.getStale());
    if ("score".equals(item.getKind()) && item.getSlug() != null) {
      row.put("url", scoreUrl(item.getSlug()));
      row.put("practiceUrl", practiceUrl(item.getSlug()));
    }
    return row;
  }

  /** Every field of a session except its measures and takes. */
  /**
   * A session as a line of a list: what was practiced, when, how and how well, without the counters (get_practice_session
   * has them). Empty fields are left out, so that a few recent sessions stay a short read.
   */
  public Map<String, Object> sessionBrief(PracticeSessionApiInfo s) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", s.getId() == null ? null : s.getId().toString());
    row.put("kind", s.getKind() == null ? null : s.getKind().getValue());
    row.put("title", cut(s.getTitle(), TEXT_CAP));
    row.put("exerciseType", s.getExerciseType());
    row.put("tonic", s.getTonic());
    row.put("mode", s.getMode());
    row.put("localDate", iso(s.getLocalDate()));
    row.put("activeSeconds", s.getActiveSeconds());
    row.put("takeCount", s.getTakeCount());
    row.put("measureStart", s.getMeasureStart());
    row.put("measureEnd", s.getMeasureEnd());
    row.put("hands", s.getHands() == null ? null : s.getHands().getValue());
    row.put("tempoFactor", s.getTempoFactor());
    row.put("accuracy", s.getAccuracy());
    row.put("flow", s.getFlow());
    if ("score".equals(row.get("kind"))) {
      row.put("practiceUrl", practiceUrl(s.getSlug()));
    }
    row.values().removeIf(Objects::isNull);
    return row;
  }

  public Map<String, Object> sessionRow(PracticeSessionApiInfo s) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", s.getId() == null ? null : s.getId().toString());
    row.put("kind", s.getKind() == null ? null : s.getKind().getValue());
    row.put("scoreId", s.getScoreId() == null ? null : s.getScoreId().toString());
    row.put("slug", s.getSlug());
    row.put("title", cut(s.getTitle(), TEXT_CAP));
    row.put("author", cut(s.getAuthor(), TEXT_CAP));
    row.put("exerciseType", s.getExerciseType());
    row.put("patternKey", s.getPatternKey());
    row.put("exerciseKey", s.getExerciseKey());
    row.put("tonic", s.getTonic());
    row.put("mode", s.getMode());
    row.put("grade", s.getGrade());
    row.put("startedAt", iso(s.getStartedAt()));
    row.put("endedAt", iso(s.getEndedAt()));
    row.put("timeZone", s.getTimeZone());
    row.put("localDate", iso(s.getLocalDate()));
    row.put("activeSeconds", s.getActiveSeconds());
    row.put("takeCount", s.getTakeCount());
    row.put("completedCount", s.getCompletedCount());
    row.put("measureStart", s.getMeasureStart());
    row.put("measureEnd", s.getMeasureEnd());
    row.put("measureTotal", s.getMeasureTotal());
    row.put("hands", s.getHands() == null ? null : s.getHands().getValue());
    row.put("tempoFactor", s.getTempoFactor());
    row.put("metronome", s.getMetronome());
    row.put("loop", s.getLoop());
    row.put("input", s.getInput() == null ? null : s.getInput().getValue());
    row.put("notesExpected", s.getNotesExpected());
    row.put("notesHit", s.getNotesHit());
    row.put("notesWrong", s.getNotesWrong());
    row.put("onsets", s.getOnsets());
    row.put("waits", s.getWaits());
    row.put("accuracy", s.getAccuracy());
    row.put("flow", s.getFlow());
    row.put("endReason", s.getEndReason() == null ? null : s.getEndReason().getValue());
    if ("score".equals(row.get("kind")) && s.getSlug() != null) {
      row.put("url", scoreUrl(s.getSlug()));
      row.put("practiceUrl", practiceUrl(s.getSlug()));
    }
    return row;
  }
}
