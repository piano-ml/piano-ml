package org.pianoml.backend.coach.tools;

/** Gives tests in other packages the package-private helpers of the coach tools. */
public final class CoachToolsTestAccess {

  private CoachToolsTestAccess() {
  }

  public static String symbol(String root, String kind, String bass) {
    return GetScoreHarmonyTool.symbol(root, kind, bass);
  }

  public static double[] recommendationRange(double level, String difficulty) {
    return RecommendScoresTool.range(level, difficulty);
  }
}
