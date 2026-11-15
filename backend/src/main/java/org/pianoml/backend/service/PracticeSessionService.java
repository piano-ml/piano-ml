package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.PracticeMeasure;
import org.pianoml.backend.model.PracticeSessionApiInfo;
import org.pianoml.backend.model.PracticeTake;
import org.pianoml.backend.repository.PracticeSessionRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Stores the practice sessions recorded by the workbench (issue #399).
 * <p>
 * A session is written many times: the client generates its id and re-sends it whole at the end of each take,
 * on a checkpoint while playing and when the page goes away. Totals come from the client and are checked for
 * plausibility; what identifies a score (title, author, key, grade) is read from the database, not trusted.
 */
@Slf4j
@Service
public class PracticeSessionService {

  /** Sessions come late from the offline outbox, but not that late. */
  static final Duration MAX_AGE = Duration.ofDays(7);
  static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(5);
  static final Duration MAX_LENGTH = Duration.ofHours(12);
  /** Slack between the client's active clock and its start/end timestamps. */
  static final int ACTIVE_SECONDS_SLACK = 5;

  private static final Set<String> EXERCISE_TYPES = Set.of("scale", "agility");

  /** Shape of the JSON kept in practice_session.detail. */
  public record Detail(List<PracticeMeasure> measures, List<PracticeTake> takes) {
    public Detail {
      measures = measures == null ? List.of() : measures;
      takes = takes == null ? List.of() : takes;
    }
  }

  private final PracticeSessionRepository practiceSessionRepository;
  private final ScoreRepository scoreRepository;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public PracticeSessionService(PracticeSessionRepository practiceSessionRepository, ScoreRepository scoreRepository,
                                ObjectMapper objectMapper, Clock clock) {
    this.practiceSessionRepository = practiceSessionRepository;
    this.scoreRepository = scoreRepository;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  public Optional<PracticeSession> find(UUID id) {
    return practiceSessionRepository.findById(id);
  }

  /**
   * Creates the session or replaces its content. The caller has checked that an existing session belongs to
   * {@code user}.
   *
   * @throws IllegalArgumentException (400) when the session is invalid or implausible
   */
  @Transactional
  public PracticeSession upsert(UUID id, PracticeSessionApiInfo body, User user) {
    validate(body);

    PracticeSession session = practiceSessionRepository.findById(id).orElseGet(PracticeSession::new);
    session.setId(id);
    session.setUserId(user.getId());

    String kind = body.getKind().getValue();
    session.setKind(kind);
    if (PracticeSession.KIND_SCORE.equals(kind)) {
      describeScore(session, body);
    } else {
      describeExercise(session, body);
    }

    ZoneId zone = zoneOf(body.getTimeZone());
    session.setStartedAt(body.getStartedAt());
    session.setEndedAt(body.getEndedAt());
    session.setTimeZone(zone.getId());
    session.setLocalDate(body.getStartedAt().atZoneSameInstant(zone).toLocalDate());

    session.setActiveSeconds(body.getActiveSeconds());
    session.setTakeCount(orZero(body.getTakeCount()));
    session.setCompletedCount(orZero(body.getCompletedCount()));
    session.setMeasureStart(body.getMeasureStart());
    session.setMeasureEnd(body.getMeasureEnd());
    session.setMeasureTotal(body.getMeasureTotal());
    session.setHands(body.getHands() == null ? null : body.getHands().getValue());
    session.setTempoFactor(body.getTempoFactor());
    session.setMetronome(body.getMetronome());
    session.setLoop(body.getLoop());
    session.setInput(body.getInput() == null ? null : body.getInput().getValue());
    session.setEndReason(body.getEndReason() == null ? null : body.getEndReason().getValue());

    int expected = orZero(body.getNotesExpected());
    int hit = orZero(body.getNotesHit());
    int wrong = orZero(body.getNotesWrong());
    int onsets = orZero(body.getOnsets());
    int waits = orZero(body.getWaits());
    session.setNotesExpected(expected);
    session.setNotesHit(hit);
    session.setNotesWrong(wrong);
    session.setOnsets(onsets);
    session.setWaits(waits);
    session.setAccuracy(accuracy(expected, hit, wrong));
    session.setFlow(flow(onsets, waits));

    session.setDetail(objectMapper.writeValueAsString(new Detail(body.getMeasures(), body.getTakes())));
    return practiceSessionRepository.save(session);
  }

  /** hit / (expected + wrong), or null when no note was expected (listening, no MIDI keyboard). */
  public static Double accuracy(int expected, int hit, int wrong) {
    return expected <= 0 ? null : (double) hit / (expected + wrong);
  }

  /** 1 - waits / onsets, or null when nothing was expected. */
  public static Double flow(int onsets, int waits) {
    return onsets <= 0 ? null : 1.0 - (double) waits / onsets;
  }

  private void validate(PracticeSessionApiInfo body) {
    require(body.getKind() != null, "kind is required");
    OffsetDateTime start = body.getStartedAt();
    OffsetDateTime end = body.getEndedAt();
    require(start != null && end != null, "startedAt and endedAt are required");
    OffsetDateTime now = OffsetDateTime.now(clock);
    require(!end.isBefore(start), "endedAt is before startedAt");
    require(!end.isAfter(now.plus(MAX_CLOCK_SKEW)), "the session ends in the future");
    require(!start.isBefore(now.minus(MAX_AGE)), "the session is too old");
    long elapsed = Duration.between(start, end).getSeconds();
    require(elapsed <= MAX_LENGTH.getSeconds(), "the session is too long");
    require(body.getActiveSeconds() != null && body.getActiveSeconds() >= 0, "activeSeconds is required");
    require(body.getActiveSeconds() <= elapsed + ACTIVE_SECONDS_SLACK, "activeSeconds exceeds the session length");

    requireCounters(orZero(body.getNotesExpected()), orZero(body.getNotesHit()), orZero(body.getNotesWrong()),
      orZero(body.getOnsets()), orZero(body.getWaits()));
    for (PracticeMeasure m : orEmpty(body.getMeasures())) {
      require(m != null && m.getMeasure() != null && m.getMeasure() >= 1, "invalid measure");
      requireCounters(orZero(m.getNotesExpected()), orZero(m.getNotesHit()), orZero(m.getNotesWrong()),
        orZero(m.getOnsets()), orZero(m.getWaits()));
    }
    for (PracticeTake t : orEmpty(body.getTakes())) {
      require(t != null, "invalid take");
      requireCounters(orZero(t.getNotesExpected()), orZero(t.getNotesHit()), orZero(t.getNotesWrong()),
        orZero(t.getOnsets()), orZero(t.getWaits()));
    }
    require(orZero(body.getCompletedCount()) <= Math.max(orZero(body.getTakeCount()), orEmpty(body.getTakes()).size()),
      "completedCount exceeds takeCount");
    if (body.getTempoFactor() != null) {
      require(body.getTempoFactor() > 0 && body.getTempoFactor() <= 10, "invalid tempoFactor");
    }
  }

  private static void requireCounters(int expected, int hit, int wrong, int onsets, int waits) {
    require(expected >= 0 && hit >= 0 && wrong >= 0 && onsets >= 0 && waits >= 0, "negative counter");
    require(hit <= expected, "notesHit exceeds notesExpected");
    require(waits <= onsets, "waits exceeds onsets");
    require(onsets <= expected, "onsets exceeds notesExpected");
  }

  private void describeScore(PracticeSession session, PracticeSessionApiInfo body) {
    require(body.getScoreId() != null, "scoreId is required for a score");
    Score score = scoreRepository.findById(body.getScoreId())
      .orElseThrow(() -> new IllegalArgumentException("unknown score " + body.getScoreId()));
    session.setScoreId(score.getId());
    session.setTitle(score.getTitle());
    session.setAuthor(score.getAuthor() == null ? null : score.getAuthor().getName());
    session.setTonic(score.getTonic());
    session.setMode(score.getMode());
    session.setGrade(score.getGrade());
    session.setExerciseType(null);
    session.setPatternKey(null);
    session.setExerciseKey(null);
  }

  private void describeExercise(PracticeSession session, PracticeSessionApiInfo body) {
    require(body.getExerciseType() != null && EXERCISE_TYPES.contains(body.getExerciseType()),
      "exerciseType must be scale or agility");
    require(hasText(body.getPatternKey()) && hasText(body.getExerciseKey()) && hasText(body.getTonic()),
      "patternKey, exerciseKey and tonic are required for an exercise");
    session.setScoreId(null);
    session.setAuthor(null);
    session.setGrade(null);
    session.setTitle(body.getTitle());
    session.setExerciseType(body.getExerciseType());
    session.setPatternKey(body.getPatternKey());
    session.setExerciseKey(body.getExerciseKey());
    session.setTonic(body.getTonic());
    session.setMode(body.getMode());
  }

  /** The user's sessions, newest first. A scoreId takes precedence over the kind. */
  public List<PracticeSession> recent(User user, int limit, String kind, UUID scoreId) {
    PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, 100)));
    if (scoreId != null) {
      return practiceSessionRepository.findByUserIdAndScoreIdOrderByStartedAtDesc(user.getId(), scoreId, page);
    }
    if (hasText(kind)) {
      return practiceSessionRepository.findByUserIdAndKindOrderByStartedAtDesc(user.getId(), kind, page);
    }
    return practiceSessionRepository.findByUserIdOrderByStartedAtDesc(user.getId(), page);
  }

  @Transactional
  public int deleteHistory(User user) {
    int deleted = practiceSessionRepository.deleteAllOfUser(user.getId());
    log.info("Deleted {} practice session(s) of user {}", deleted, user.getId());
    return deleted;
  }

  public PracticeSessionApiInfo toApiInfo(PracticeSession session, String slug) {
    PracticeSessionApiInfo api = new PracticeSessionApiInfo();
    api.setId(session.getId());
    api.setKind(PracticeSessionApiInfo.KindEnum.fromValue(session.getKind()));
    api.setScoreId(session.getScoreId());
    api.setSlug(slug);
    api.setTitle(session.getTitle());
    api.setAuthor(session.getAuthor());
    api.setExerciseType(session.getExerciseType());
    api.setPatternKey(session.getPatternKey());
    api.setExerciseKey(session.getExerciseKey());
    api.setTonic(session.getTonic());
    api.setMode(session.getMode());
    api.setGrade(session.getGrade());
    api.setStartedAt(session.getStartedAt());
    api.setEndedAt(session.getEndedAt());
    api.setTimeZone(session.getTimeZone());
    api.setLocalDate(session.getLocalDate());
    api.setActiveSeconds(session.getActiveSeconds());
    api.setTakeCount(session.getTakeCount());
    api.setCompletedCount(session.getCompletedCount());
    api.setMeasureStart(session.getMeasureStart());
    api.setMeasureEnd(session.getMeasureEnd());
    api.setMeasureTotal(session.getMeasureTotal());
    if (session.getHands() != null) {
      api.setHands(PracticeSessionApiInfo.HandsEnum.fromValue(session.getHands()));
    }
    api.setTempoFactor(session.getTempoFactor());
    api.setMetronome(session.getMetronome());
    api.setLoop(session.getLoop());
    if (session.getInput() != null) {
      api.setInput(PracticeSessionApiInfo.InputEnum.fromValue(session.getInput()));
    }
    api.setNotesExpected(session.getNotesExpected());
    api.setNotesHit(session.getNotesHit());
    api.setNotesWrong(session.getNotesWrong());
    api.setOnsets(session.getOnsets());
    api.setWaits(session.getWaits());
    api.setAccuracy(session.getAccuracy());
    api.setFlow(session.getFlow());
    if (session.getEndReason() != null) {
      api.setEndReason(PracticeSessionApiInfo.EndReasonEnum.fromValue(session.getEndReason()));
    }
    Detail detail = readDetail(session);
    api.setMeasures(new ArrayList<>(detail.measures()));
    api.setTakes(new ArrayList<>(detail.takes()));
    return api;
  }

  /** Slug of the session's score, for links; null for an exercise or a score that is gone. */
  public String slugOf(PracticeSession session) {
    if (session.getScoreId() == null) {
      return null;
    }
    return scoreRepository.findById(session.getScoreId()).map(PracticeSessionService::slugOf).orElse(null);
  }

  static String slugOf(Score score) {
    return score.getImmutableSlug() != null ? score.getImmutableSlug() : score.getMutableSlug();
  }

  /** The per-measure counters and takes of a session; empty when the stored JSON cannot be read. */
  public Detail readDetail(PracticeSession session) {
    if (!hasText(session.getDetail())) {
      return new Detail(null, null);
    }
    try {
      return objectMapper.readValue(session.getDetail(), Detail.class);
    } catch (RuntimeException e) {
      log.warn("Unreadable detail in practice session {}: {}", session.getId(), e.getMessage());
      return new Detail(null, null);
    }
  }

  static ZoneId zoneOf(String timeZone) {
    if (hasText(timeZone)) {
      try {
        return ZoneId.of(timeZone);
      } catch (DateTimeException e) {
        // unknown zone: fall through
      }
    }
    return ZoneOffset.UTC;
  }

  private static void require(boolean condition, String message) {
    if (!condition) {
      throw new IllegalArgumentException(message);
    }
  }

  private static int orZero(Integer value) {
    return value == null ? 0 : value;
  }

  private static <T> List<T> orEmpty(List<T> list) {
    return list == null ? List.of() : list;
  }

  private static boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
