package org.pianoml.backend.service;

import org.pianoml.backend.entity.PracticeSession;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.PracticeAccuracyTrend;
import org.pianoml.backend.model.PracticeAccuracyWindow;
import org.pianoml.backend.model.PracticeDay;
import org.pianoml.backend.model.PracticeGradeCount;
import org.pianoml.backend.model.PracticeItemStats;
import org.pianoml.backend.model.PracticeKeyStats;
import org.pianoml.backend.model.PracticeLevel;
import org.pianoml.backend.model.PracticeMeasure;
import org.pianoml.backend.model.PracticeRegularity;
import org.pianoml.backend.model.PracticeSummary;
import org.pianoml.backend.model.PracticeTake;
import org.pianoml.backend.model.PracticeVolume;
import org.pianoml.backend.model.PracticeWeakMeasure;
import org.pianoml.backend.repository.PracticeSessionRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;

/**
 * The progress of a user, computed from their practice sessions (issue #399): regularity, volume, accuracy
 * trend, statistics per key and per item, weak measures and level.
 */
@Service
public class PracticeSummaryService {

  /** Sessions read for a summary, newest first. */
  static final int MAX_SESSIONS = 5000;
  static final int MAX_ITEMS = 200;
  /** Active time that makes a calendar day a practice day. */
  static final int PRACTICE_DAY_SECONDS = 60;
  static final double MASTERED_ACCURACY = 0.9;
  static final Duration STALE_AFTER = Duration.ofDays(14);
  static final int WEAK_MEASURE_SESSIONS = 5;
  static final int WEAK_MEASURES = 5;
  static final double WEAK_MEASURE_ACCURACY = 0.95;
  static final int TREND_WINDOW = 10;

  private final PracticeSessionRepository practiceSessionRepository;
  private final PracticeSessionService practiceSessionService;
  private final ScoreRepository scoreRepository;
  private final Clock clock;

  public PracticeSummaryService(PracticeSessionRepository practiceSessionRepository,
                                PracticeSessionService practiceSessionService, ScoreRepository scoreRepository,
                                Clock clock) {
    this.practiceSessionRepository = practiceSessionRepository;
    this.practiceSessionService = practiceSessionService;
    this.scoreRepository = scoreRepository;
    this.clock = clock;
  }

  public PracticeSummary summary(User user, String timeZone) {
    List<PracticeSession> sessions = practiceSessionRepository
      .findByUserIdOrderByStartedAtDesc(user.getId(), PageRequest.of(0, MAX_SESSIONS));

    String zoneId = timeZone != null && !timeZone.isBlank() ? timeZone
      : sessions.stream().map(PracticeSession::getTimeZone).filter(Objects::nonNull).findFirst().orElse(null);
    ZoneId zone = PracticeSessionService.zoneOf(zoneId);
    OffsetDateTime now = OffsetDateTime.now(clock);
    LocalDate today = now.atZoneSameInstant(zone).toLocalDate();

    PracticeSummary summary = new PracticeSummary();
    summary.setGeneratedAt(now);
    summary.setTimeZone(zone.getId());
    summary.setRegularity(regularity(sessions, today));
    List<PracticeItemStats> items = items(sessions, now);
    summary.setVolume(volume(sessions, items, today));
    summary.setScoreAccuracy(trend(sessions, PracticeSession.KIND_SCORE));
    summary.setExerciseAccuracy(trend(sessions, PracticeSession.KIND_EXERCISE));
    summary.setKeys(keys(sessions));
    summary.setLevel(level(items, sessions));
    summary.setItems(items.size() > MAX_ITEMS ? new ArrayList<>(items.subList(0, MAX_ITEMS)) : items);
    return summary;
  }

  // --- regularity ------------------------------------------------------------------------------------------

  private PracticeRegularity regularity(List<PracticeSession> sessions, LocalDate today) {
    TreeMap<LocalDate, int[]> days = new TreeMap<>(); // date -> {activeSeconds, sessions}
    long totalSeconds = 0;
    for (PracticeSession s : sessions) {
      int[] day = days.computeIfAbsent(s.getLocalDate(), d -> new int[2]);
      day[0] += s.getActiveSeconds();
      day[1] += 1;
      totalSeconds += s.getActiveSeconds();
    }
    TreeSet<LocalDate> practiceDays = new TreeSet<>();
    days.forEach((date, day) -> {
      if (day[0] >= PRACTICE_DAY_SECONDS) {
        practiceDays.add(date);
      }
    });

    PracticeRegularity regularity = new PracticeRegularity();
    regularity.setCurrentStreakDays(currentStreak(practiceDays, today));
    regularity.setLongestStreakDays(longestStreak(practiceDays));
    regularity.setPracticeDays7(practiceDays.tailSet(today.minusDays(6), true).size());
    regularity.setPracticeDays30(practiceDays.tailSet(today.minusDays(29), true).size());
    regularity.setPracticeDays90(practiceDays.tailSet(today.minusDays(89), true).size());
    regularity.setLastPracticeDate(practiceDays.isEmpty() ? null : practiceDays.last());
    regularity.setAverageSessionSeconds(sessions.isEmpty() ? 0 : (int) (totalSeconds / sessions.size()));
    List<PracticeDay> daily = new ArrayList<>();
    days.tailMap(today.minusDays(89), true).forEach((date, day) -> {
      PracticeDay practiceDay = new PracticeDay();
      practiceDay.setDate(date);
      practiceDay.setActiveSeconds(day[0]);
      practiceDay.setSessions(day[1]);
      daily.add(practiceDay);
    });
    regularity.setDaily(daily);
    return regularity;
  }

  /** Consecutive practice days ending today, or yesterday when today has not been practiced yet. */
  static int currentStreak(TreeSet<LocalDate> practiceDays, LocalDate today) {
    LocalDate day = practiceDays.contains(today) ? today : today.minusDays(1);
    int streak = 0;
    while (practiceDays.contains(day)) {
      streak++;
      day = day.minusDays(1);
    }
    return streak;
  }

  static int longestStreak(TreeSet<LocalDate> practiceDays) {
    int longest = 0;
    int run = 0;
    LocalDate previous = null;
    for (LocalDate day : practiceDays) {
      run = previous != null && previous.plusDays(1).equals(day) ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = day;
    }
    return longest;
  }

  // --- volume ----------------------------------------------------------------------------------------------

  private PracticeVolume volume(List<PracticeSession> sessions, List<PracticeItemStats> items, LocalDate today) {
    long total = 0;
    long last7 = 0;
    long last30 = 0;
    for (PracticeSession s : sessions) {
      total += s.getActiveSeconds();
      if (!s.getLocalDate().isBefore(today.minusDays(6))) {
        last7 += s.getActiveSeconds();
      }
      if (!s.getLocalDate().isBefore(today.minusDays(29))) {
        last30 += s.getActiveSeconds();
      }
    }
    PracticeVolume volume = new PracticeVolume();
    volume.setActiveSeconds(total);
    volume.setActiveSeconds7(last7);
    volume.setActiveSeconds30(last30);
    volume.setSessions(sessions.size());
    volume.setScores((int) items.stream().filter(i -> PracticeSession.KIND_SCORE.equals(i.getKind())).count());
    volume.setExercises((int) items.stream().filter(i -> PracticeSession.KIND_EXERCISE.equals(i.getKind())).count());
    return volume;
  }

  // --- accuracy trend --------------------------------------------------------------------------------------

  private PracticeAccuracyTrend trend(List<PracticeSession> sessions, String kind) {
    List<PracticeSession> assessed = sessions.stream()
      .filter(s -> kind.equals(s.getKind()) && s.getAccuracy() != null)
      .toList();
    PracticeAccuracyTrend trend = new PracticeAccuracyTrend();
    trend.setLast10(window(assessed, 0));
    trend.setPrevious10(window(assessed, TREND_WINDOW));
    return trend;
  }

  private PracticeAccuracyWindow window(List<PracticeSession> assessed, int from) {
    List<PracticeSession> slice = assessed.subList(Math.min(from, assessed.size()),
      Math.min(from + TREND_WINDOW, assessed.size()));
    PracticeAccuracyWindow window = new PracticeAccuracyWindow();
    window.setSessions(slice.size());
    if (!slice.isEmpty()) {
      window.setAccuracy(slice.stream().mapToDouble(PracticeSession::getAccuracy).average().orElse(0));
      slice.stream().map(PracticeSession::getFlow).filter(Objects::nonNull).mapToDouble(Double::doubleValue)
        .average().ifPresent(window::setFlow);
    }
    return window;
  }

  // --- keys ------------------------------------------------------------------------------------------------

  private List<PracticeKeyStats> keys(List<PracticeSession> sessions) {
    Map<String, PracticeKeyStats> byKey = new LinkedHashMap<>();
    Map<String, long[]> counters = new HashMap<>(); // key -> {expected, hit, wrong}
    for (PracticeSession s : sessions) {
      if (s.getTonic() == null || s.getTonic().isBlank()) {
        continue;
      }
      String mode = keyMode(s);
      String key = s.getTonic() + " " + mode;
      PracticeKeyStats stats = byKey.computeIfAbsent(key, k -> {
        PracticeKeyStats created = new PracticeKeyStats();
        created.setTonic(s.getTonic());
        created.setMode(mode);
        created.setActiveSeconds(0L);
        created.setSessions(0);
        created.setLastPlayedAt(s.getStartedAt()); // sessions are newest first
        return created;
      });
      stats.setActiveSeconds(stats.getActiveSeconds() + s.getActiveSeconds());
      stats.setSessions(stats.getSessions() + 1);
      long[] c = counters.computeIfAbsent(key, k -> new long[3]);
      c[0] += s.getNotesExpected();
      c[1] += s.getNotesHit();
      c[2] += s.getNotesWrong();
    }
    byKey.forEach((key, stats) -> {
      long[] c = counters.get(key);
      if (c[0] > 0) {
        stats.setAccuracy((double) c[1] / (c[0] + c[2]));
      }
    });
    List<PracticeKeyStats> keys = new ArrayList<>(byKey.values());
    keys.sort(Comparator.comparing(PracticeKeyStats::getActiveSeconds).reversed());
    return keys;
  }

  /** "major" or "minor": exercises carry the scale or chord name ("harmonic_minor"), scores the mode itself. */
  static String keyMode(PracticeSession s) {
    String source = PracticeSession.KIND_EXERCISE.equals(s.getKind()) && s.getPatternKey() != null
      ? s.getPatternKey() : s.getMode();
    return source != null && source.toLowerCase().contains("minor") ? "minor" : "major";
  }

  // --- items -----------------------------------------------------------------------------------------------

  /** Mutable accumulator of one item's sessions (visited newest first). */
  private static final class ItemAccumulator {
    final PracticeItemStats stats = new PracticeItemStats();
    final TreeSet<String> hands = new TreeSet<>();
    final TreeSet<Integer> measures = new TreeSet<>();
    final Map<Integer, int[]> recentMeasures = new TreeMap<>(); // measure -> {expected, hit, wrong, waits}
    int sessions;
    long activeSeconds;
    int completed;
    boolean handsTogether;
    Double bestAccuracy;
    Double bestTempo;
    /** A complete take, hands together, at mastered accuracy. */
    boolean mastered;
  }

  private List<PracticeItemStats> items(List<PracticeSession> sessions, OffsetDateTime now) {
    Map<String, ItemAccumulator> byItem = new LinkedHashMap<>(); // insertion order = most recently played first
    for (PracticeSession s : sessions) {
      ItemAccumulator item = byItem.computeIfAbsent(itemKey(s), k -> newItem(s));
      PracticeSessionService.Detail detail = practiceSessionService.readDetail(s);

      item.sessions++;
      item.activeSeconds += s.getActiveSeconds();
      item.completed += s.getCompletedCount();
      item.stats.setFirstPlayedAt(s.getStartedAt());
      if (s.getAccuracy() != null) {
        if (item.stats.getLastAccuracy() == null) {
          item.stats.setLastAccuracy(s.getAccuracy());
        }
        if (item.bestAccuracy == null || s.getAccuracy() > item.bestAccuracy) {
          item.bestAccuracy = s.getAccuracy();
        }
      }
      if (s.getHands() != null) {
        item.hands.add(s.getHands());
      }
      for (PracticeTake take : detail.takes()) {
        if (take.getHands() != null) {
          item.hands.add(take.getHands());
        }
        Double accuracy = PracticeSessionService.accuracy(orZero(take.getNotesExpected()), orZero(take.getNotesHit()),
          orZero(take.getNotesWrong()));
        if (Boolean.TRUE.equals(take.getCompleted()) && accuracy != null && accuracy >= MASTERED_ACCURACY) {
          if (take.getTempoFactor() != null && (item.bestTempo == null || take.getTempoFactor() > item.bestTempo)) {
            item.bestTempo = take.getTempoFactor();
          }
          if ("both".equals(take.getHands())) {
            item.mastered = true;
          }
        }
      }
      item.handsTogether = item.hands.contains("both");
      for (PracticeMeasure m : detail.measures()) {
        if (m.getMeasure() == null) {
          continue;
        }
        item.measures.add(m.getMeasure());
        if (item.sessions <= WEAK_MEASURE_SESSIONS) {
          int[] c = item.recentMeasures.computeIfAbsent(m.getMeasure(), k -> new int[4]);
          c[0] += orZero(m.getNotesExpected());
          c[1] += orZero(m.getNotesHit());
          c[2] += orZero(m.getNotesWrong());
          c[3] += orZero(m.getWaits());
        }
      }
    }

    Map<UUID, String> slugs = slugs(byItem.values());
    List<PracticeItemStats> items = new ArrayList<>();
    for (ItemAccumulator item : byItem.values()) {
      PracticeItemStats stats = item.stats;
      stats.setSlug(stats.getScoreId() == null ? null : slugs.get(stats.getScoreId()));
      stats.setSessions(item.sessions);
      stats.setActiveSeconds(item.activeSeconds);
      stats.setBestAccuracy(item.bestAccuracy);
      stats.setBestTempoFactor(item.bestTempo);
      stats.setHands(new ArrayList<>(item.hands));
      stats.setPlayedHandsTogether(item.handsTogether);
      stats.setCompletedCount(item.completed);
      stats.setMeasuresCovered(item.measures.size());
      if (stats.getMeasureTotal() != null && stats.getMeasureTotal() > 0) {
        stats.setCoverage(Math.min(1.0, (double) item.measures.size() / stats.getMeasureTotal()));
      }
      stats.setWeakMeasures(weakMeasures(item.recentMeasures));
      boolean notMastered = item.completed == 0 || item.bestAccuracy == null || item.bestAccuracy < MASTERED_ACCURACY;
      stats.setStale(notMastered && stats.getLastPlayedAt().isBefore(now.minus(STALE_AFTER)));
      items.add(stats);
    }
    return items;
  }

  private static ItemAccumulator newItem(PracticeSession s) {
    ItemAccumulator item = new ItemAccumulator();
    PracticeItemStats stats = item.stats;
    stats.setKind(s.getKind());
    stats.setScoreId(s.getScoreId());
    stats.setTitle(s.getTitle());
    stats.setAuthor(s.getAuthor());
    stats.setExerciseType(s.getExerciseType());
    stats.setPatternKey(s.getPatternKey());
    stats.setExerciseKey(s.getExerciseKey());
    stats.setTonic(s.getTonic());
    stats.setMode(s.getMode());
    stats.setGrade(s.getGrade());
    stats.setMeasureTotal(s.getMeasureTotal());
    stats.setLastPlayedAt(s.getStartedAt()); // sessions are newest first
    return item;
  }

  /** Identity of what was played. A score deleted since is told apart by its title. */
  static String itemKey(PracticeSession s) {
    if (PracticeSession.KIND_EXERCISE.equals(s.getKind())) {
      return "e:" + s.getExerciseType() + "/" + s.getPatternKey() + "/" + s.getTonic() + "/" + s.getExerciseKey();
    }
    return s.getScoreId() != null ? "s:" + s.getScoreId() : "s:deleted:" + s.getAuthor() + "/" + s.getTitle();
  }

  private static List<PracticeWeakMeasure> weakMeasures(Map<Integer, int[]> measures) {
    List<PracticeWeakMeasure> weak = new ArrayList<>();
    measures.forEach((measure, c) -> {
      Double accuracy = PracticeSessionService.accuracy(c[0], c[1], c[2]);
      if (accuracy != null && (accuracy < WEAK_MEASURE_ACCURACY || c[3] > 0)) {
        PracticeWeakMeasure w = new PracticeWeakMeasure();
        w.setMeasure(measure);
        w.setAccuracy(accuracy);
        w.setNotesExpected(c[0]);
        w.setWaits(c[3]);
        weak.add(w);
      }
    });
    weak.sort(Comparator.comparing(PracticeWeakMeasure::getAccuracy)
      .thenComparing(Comparator.comparing(PracticeWeakMeasure::getWaits).reversed()));
    List<PracticeWeakMeasure> worst = new ArrayList<>(weak.subList(0, Math.min(WEAK_MEASURES, weak.size())));
    worst.sort(Comparator.comparing(PracticeWeakMeasure::getMeasure));
    return worst;
  }

  private Map<UUID, String> slugs(Iterable<ItemAccumulator> items) {
    List<UUID> ids = new ArrayList<>();
    int count = 0;
    for (ItemAccumulator item : items) {
      if (count++ < MAX_ITEMS && item.stats.getScoreId() != null) {
        ids.add(item.stats.getScoreId());
      }
    }
    Map<UUID, String> slugs = new HashMap<>();
    if (!ids.isEmpty()) {
      for (Score score : scoreRepository.findAllById(ids)) {
        slugs.put(score.getId(), PracticeSessionService.slugOf(score));
      }
    }
    return slugs;
  }

  // --- level -----------------------------------------------------------------------------------------------

  private PracticeLevel level(List<PracticeItemStats> items, List<PracticeSession> sessions) {
    TreeMap<Integer, Integer> grades = new TreeMap<>();
    for (PracticeItemStats item : items) {
      if (PracticeSession.KIND_SCORE.equals(item.getKind()) && item.getGrade() != null) {
        grades.merge(Math.round(item.getGrade()), 1, Integer::sum);
      }
    }
    PracticeLevel level = new PracticeLevel();
    List<PracticeGradeCount> counts = new ArrayList<>();
    grades.forEach((grade, scores) -> {
      PracticeGradeCount count = new PracticeGradeCount();
      count.setGrade(grade);
      count.setScores(scores);
      counts.add(count);
    });
    level.setGrades(counts);

    Float highest = null;
    for (PracticeSession s : sessions) {
      if (s.getGrade() == null || (highest != null && s.getGrade() <= highest)) {
        continue;
      }
      for (PracticeTake take : practiceSessionService.readDetail(s).takes()) {
        Double accuracy = PracticeSessionService.accuracy(orZero(take.getNotesExpected()), orZero(take.getNotesHit()),
          orZero(take.getNotesWrong()));
        if (Boolean.TRUE.equals(take.getCompleted()) && "both".equals(take.getHands())
          && accuracy != null && accuracy >= MASTERED_ACCURACY) {
          highest = s.getGrade();
          break;
        }
      }
    }
    level.setHighestGradeMastered(highest);
    return level;
  }

  private static int orZero(Integer value) {
    return value == null ? 0 : value;
  }
}
