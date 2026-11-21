package org.pianoml.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class SupportedLocalesTest {

  private final SupportedLocales locales = new SupportedLocales(List.of("en", "es", "fr", "zh-Hans", "uk", "nl"));

  @Test
  void keepsTheLanguageAskedFor_whenTheSiteHasIt() {
    assertThat(locales.resolve("fr", "es")).isEqualTo("fr");
    assertThat(locales.resolve("zh-hans", null)).isEqualTo("zh-Hans");
    assertThat(locales.resolve("fr_CA", null)).isEqualTo("fr");
  }

  @Test
  void elseTakesTheBestAcceptLanguageMatch_likeTheFrontend() {
    assertThat(locales.resolve(null, "es-ES,es;q=0.9,en;q=0.8")).isEqualTo("es");
    assertThat(locales.resolve("klingon", "ja-JP,ja;q=0.9,es;q=0.5,en;q=0.4")).isEqualTo("es");
    assertThat(locales.resolve("", "zh-CN,zh;q=0.9")).isEqualTo("zh-Hans");
    assertThat(locales.resolve(null, "uk-UA,ru;q=0.8")).isEqualTo("uk");
    assertThat(locales.resolve(null, "fr;q=0.5, es, en;q=0.8")).isEqualTo("es");
    assertThat(locales.resolve(null, "es;q=0, nl")).isEqualTo("nl");
  }

  @Test
  void elseFallsBackToTheSourceLanguage() {
    assertThat(locales.resolve(null, null)).isEqualTo("en");
    assertThat(locales.resolve("ja", "ja-JP,hi;q=0.8")).isEqualTo("en");
    assertThat(locales.resolve(null, "*")).isEqualTo("en");
    assertThat(locales.resolve(null, ";;,q=x")).isEqualTo("en");
  }

  @Test
  void ordersAcceptLanguageByQualityThenPosition_droppingQ0AndStar() {
    assertThat(SupportedLocales.parseAcceptLanguage("fr;q=0.5, es, en;q=0.8, de;q=0, *")).containsExactly("es", "en", "fr");
    assertThat(SupportedLocales.parseAcceptLanguage("")).isEmpty();
    assertThat(SupportedLocales.parseAcceptLanguage(null)).isEmpty();
  }

  /** i18n.locales must list the languages of frontend/angular.json, source language first. */
  @Test
  void i18nLocalesMatchesAngularJson() throws IOException {
    Path angularJson = Path.of("..", "frontend", "angular.json");
    assumeTrue(Files.exists(angularJson), "frontend/angular.json not checked out next to the backend");
    JsonNode i18n = new ObjectMapper().readTree(angularJson.toFile()).at("/projects/piano-ml/i18n");
    List<String> expected = new ArrayList<>();
    JsonNode source = i18n.get("sourceLocale");
    expected.add(source.isTextual() ? source.asText() : source.get("code").asText());
    i18n.get("locales").fieldNames().forEachRemaining(expected::add);

    Properties properties = new Properties();
    try (InputStream in = getClass().getResourceAsStream("/i18n.properties")) {
      properties.load(in);
    }
    List<String> codes = List.of(properties.getProperty("i18n.locales").split(","));
    assertThat(codes).containsExactlyElementsOf(expected);

    // pathPrefix gives each language's subPath (the URL prefix of reset links)
    SupportedLocales site = new SupportedLocales(codes);
    assertThat(site.pathPrefix(expected.getFirst())).isEqualTo(source.isTextual() ? "" : source.path("subPath").asText(""));
    i18n.get("locales").properties().forEach(entry ->
      assertThat(site.pathPrefix(entry.getKey())).as(entry.getKey()).isEqualTo(entry.getValue().path("subPath").asText(entry.getKey())));
  }

  @Test
  void pathPrefixIsEmptyForTheSourceLanguage_elseTheLanguageSubtag() {
    assertThat(locales.pathPrefix("en")).isEmpty();
    assertThat(locales.pathPrefix("fr")).isEqualTo("fr");
    assertThat(locales.pathPrefix("zh-Hans")).isEqualTo("zh");
  }
}
