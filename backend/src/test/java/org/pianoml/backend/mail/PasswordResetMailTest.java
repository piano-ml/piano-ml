package org.pianoml.backend.mail;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordResetMailTest {

  private final PasswordResetMail mail = new PasswordResetMail();

  private static List<String> siteLocales() throws IOException {
    Properties properties = new Properties();
    try (InputStream in = PasswordResetMailTest.class.getResourceAsStream("/i18n.properties")) {
      properties.load(in);
    }
    return List.of(properties.getProperty("i18n.locales").split(","));
  }

  @Test
  void everySiteLanguageHasEveryText() throws IOException {
    Properties english = PasswordResetMail.load("en");
    assertThat(english).isNotEmpty();
    for (String locale : siteLocales()) {
      Properties texts = PasswordResetMail.load(locale);
      assertThat(texts.stringPropertyNames()).as(locale).isEqualTo(english.stringPropertyNames());
      texts.forEach((key, value) -> assertThat((String) value).as(locale + " " + key).isNotBlank());
      assertThat(texts.getProperty("greeting")).as(locale).contains("{name}");
    }
  }

  @Test
  void rendersTheLinkAndTheName_escapedInHtml() {
    PasswordResetMail.Message message = mail.render("fr", "<Lily & co>", "https://pianoml.org/fr/account/reset-password?token=a&b");

    assertThat(message.subject()).isEqualTo("Réinitialisez votre mot de passe PianoML");
    assertThat(message.text()).contains("Bonjour <Lily & co>,", "https://pianoml.org/fr/account/reset-password?token=a&b");
    assertThat(message.html())
      .contains("Bonjour &lt;Lily &amp; co&gt;,", "href=\"https://pianoml.org/fr/account/reset-password?token=a&amp;b\"",
        "lang=\"fr\"", "Choisir un nouveau mot de passe")
      .doesNotContain("<Lily");
  }

  @Test
  void aLanguageWithoutTextsIsInEnglish() {
    assertThat(mail.render("ja", "Lily", "https://x").subject()).isEqualTo("Reset your PianoML password");
  }
}
