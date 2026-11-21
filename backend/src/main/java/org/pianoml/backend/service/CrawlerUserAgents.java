package org.pianoml.backend.service;

import java.util.regex.Pattern;

/**
 * Tells a crawler (Googlebot, Bingbot...) from a browser by its User-Agent. Crawlers render pages with tight time
 * and request budgets: their failed fetches are noise in the error reports, not errors users meet. The same rule as
 * isCrawler in the frontend's error-reporting.config.ts.
 */
public final class CrawlerUserAgents {

  /**
   * "Xbot/1.0" or "Xbot;", the usual crawler words, a few crawlers without them, and the contact URL crawlers put
   * in their User-Agent ("+http://www.google.com/bot.html"). Not a bare "bot": phones like the CUBOT X50 have one.
   */
  private static final Pattern CRAWLER = Pattern.compile(
    "bot[/;]|crawler|spider|slurp|mediapartners|facebookexternalhit|google-inspectiontool|bingpreview|\\+https?://",
    Pattern.CASE_INSENSITIVE);

  private CrawlerUserAgents() {
  }

  public static boolean isCrawler(String userAgent) {
    return userAgent != null && CRAWLER.matcher(userAgent).find();
  }
}
