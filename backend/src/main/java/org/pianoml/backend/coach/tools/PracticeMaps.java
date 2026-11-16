package org.pianoml.backend.coach.tools;

import org.pianoml.backend.model.PracticeAccuracyTrend;
import org.pianoml.backend.model.PracticeAccuracyWindow;
import org.pianoml.backend.model.PracticeGradeCount;
import org.pianoml.backend.model.PracticeKeyStats;
import org.pianoml.backend.model.PracticeLevel;
import org.pianoml.backend.model.PracticeRegularity;
import org.pianoml.backend.model.PracticeVolume;
import org.pianoml.backend.model.PracticeWeakMeasure;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.pianoml.backend.coach.tools.CoachRows.iso;

/** Plain maps of the practice summary models, dates as ISO-8601 strings (coach, issue #414). */
final class PracticeMaps {

  private PracticeMaps() {
  }

  /** Regularity without the day-by-day list (get_practice_calendar has it). */
  static Map<String, Object> regularity(PracticeRegularity r) {
    Map<String, Object> m = new LinkedHashMap<>();
    if (r == null) {
      return m;
    }
    m.put("currentStreakDays", r.getCurrentStreakDays());
    m.put("longestStreakDays", r.getLongestStreakDays());
    m.put("practiceDays7", r.getPracticeDays7());
    m.put("practiceDays30", r.getPracticeDays30());
    m.put("practiceDays90", r.getPracticeDays90());
    m.put("lastPracticeDate", iso(r.getLastPracticeDate()));
    m.put("averageSessionSeconds", r.getAverageSessionSeconds());
    return m;
  }

  static Map<String, Object> volume(PracticeVolume v) {
    Map<String, Object> m = new LinkedHashMap<>();
    if (v == null) {
      return m;
    }
    m.put("activeSeconds", v.getActiveSeconds());
    m.put("activeSeconds7", v.getActiveSeconds7());
    m.put("activeSeconds30", v.getActiveSeconds30());
    m.put("sessions", v.getSessions());
    m.put("scores", v.getScores());
    m.put("exercises", v.getExercises());
    return m;
  }

  static Map<String, Object> trend(PracticeAccuracyTrend t) {
    Map<String, Object> m = new LinkedHashMap<>();
    if (t == null) {
      return m;
    }
    m.put("last10", window(t.getLast10()));
    m.put("previous10", window(t.getPrevious10()));
    return m;
  }

  private static Map<String, Object> window(PracticeAccuracyWindow w) {
    if (w == null) {
      return null;
    }
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("sessions", w.getSessions());
    m.put("accuracy", w.getAccuracy());
    m.put("flow", w.getFlow());
    return m;
  }

  static Map<String, Object> level(PracticeLevel l) {
    Map<String, Object> m = new LinkedHashMap<>();
    if (l == null) {
      return m;
    }
    m.put("highestGradeMastered", l.getHighestGradeMastered());
    List<Map<String, Object>> grades = l.getGrades() == null ? List.of() : l.getGrades().stream().map(PracticeMaps::grade).toList();
    m.put("grades", grades);
    return m;
  }

  private static Map<String, Object> grade(PracticeGradeCount g) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("grade", g.getGrade());
    m.put("scores", g.getScores());
    return m;
  }

  static Map<String, Object> key(PracticeKeyStats k) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("tonic", k.getTonic());
    m.put("mode", k.getMode());
    m.put("activeSeconds", k.getActiveSeconds());
    m.put("sessions", k.getSessions());
    m.put("accuracy", k.getAccuracy());
    m.put("lastPlayedAt", iso(k.getLastPlayedAt()));
    return m;
  }

  static Map<String, Object> weakMeasure(PracticeWeakMeasure w) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("measure", w.getMeasure());
    m.put("accuracy", w.getAccuracy());
    m.put("notesExpected", w.getNotesExpected());
    m.put("waits", w.getWaits());
    return m;
  }
}
