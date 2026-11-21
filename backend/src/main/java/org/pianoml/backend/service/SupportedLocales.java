package org.pianoml.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.PropertySource;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The languages the site is built in ({@code i18n.locales}, the codes of angular.json, source language first), and
 * the choice of one of them for a request. Matches like the frontend's locale-negotiation.ts: a tag matches a
 * language exactly, or else by its primary language ({@code es-MX} → {@code es}, {@code zh-CN} → {@code zh-Hans}).
 */
@Component
@PropertySource("classpath:i18n.properties")
public class SupportedLocales {

  private final List<String> codes;

  public SupportedLocales(@Value("${i18n.locales}") List<String> codes) {
    if (codes.isEmpty()) throw new IllegalArgumentException("i18n.locales is empty");
    this.codes = List.copyOf(codes);
  }

  /** Every language, source language first. */
  public List<String> codes() {
    return codes;
  }

  /** The source language, the fallback: {@code en}. */
  public String fallback() {
    return codes.getFirst();
  }

  /**
   * The language for a new account: the one asked for (the language the user signs up in) when the site has it,
   * else the best match of the {@code Accept-Language} header, else the source language.
   */
  public String resolve(String requested, String acceptLanguage) {
    return match(requested)
      .or(() -> parseAcceptLanguage(acceptLanguage).stream().map(this::match).flatMap(Optional::stream).findFirst())
      .orElse(fallback());
  }

  /** The site language matching a tag exactly, or else by its primary language; empty when none does. */
  Optional<String> match(String tag) {
    if (tag == null || tag.isBlank()) return Optional.empty();
    String wanted = tag.trim().replace('_', '-').toLowerCase(Locale.ROOT);
    String language = wanted.split("-")[0];
    return codes.stream().filter(code -> code.toLowerCase(Locale.ROOT).equals(wanted)).findFirst()
      .or(() -> codes.stream().filter(code -> code.toLowerCase(Locale.ROOT).split("-")[0].equals(language)).findFirst());
  }

  /** The tags of an {@code Accept-Language} header, most wanted first; {@code q=0} and {@code *} left out. */
  static List<String> parseAcceptLanguage(String header) {
    record Weighted(String tag, double quality, int index) {}
    List<Weighted> items = new ArrayList<>();
    if (header == null) return List.of();
    String[] parts = header.split(",");
    for (int i = 0; i < parts.length; i++) {
      String[] fields = parts[i].trim().split(";");
      String tag = fields.length == 0 ? "" : fields[0].trim();
      double quality = 1;
      for (int f = 1; f < fields.length; f++) {
        String param = fields[f].trim();
        if (param.startsWith("q=")) {
          try {
            quality = Double.parseDouble(param.substring(2));
          } catch (NumberFormatException e) {
            quality = 0;
          }
        }
      }
      if (!tag.isEmpty() && !tag.equals("*") && quality > 0) items.add(new Weighted(tag, quality, i));
    }
    items.sort(Comparator.comparingDouble(Weighted::quality).reversed().thenComparingInt(Weighted::index));
    return items.stream().map(Weighted::tag).toList();
  }
}
