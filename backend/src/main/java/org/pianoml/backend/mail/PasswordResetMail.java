package org.pianoml.backend.mail;

import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The password reset email, in the account's language: texts from {@code mail/password-reset.<code>.properties}
 * (UTF-8), English when a language has no file.
 */
@Component
public class PasswordResetMail {

  static final String FALLBACK = "en";

  private final Map<String, Properties> texts = new ConcurrentHashMap<>();

  public record Message(String subject, String html, String text) {}

  public Message render(String locale, String name, String link) {
    Properties t = texts(locale);
    String greeting = t.getProperty("greeting").replace("{name}", name);
    String text = String.join("\n",
      greeting, "",
      t.getProperty("intro"), "",
      t.getProperty("button") + ":", link, "",
      t.getProperty("expiry"),
      t.getProperty("ignore"), "",
      "— PianoML");
    String href = HtmlUtils.htmlEscape(link);
    String html = """
      <!doctype html>
      <html lang="%s"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#1c1917">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
      <p style="margin:0 0 16px;font-size:16px">%s</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">%s</p>
      <p style="margin:0 0 24px;text-align:center"><a href="%s" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:16px">%s</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#57534e">%s</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="%s" style="color:#57534e">%s</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#57534e">%s</p>
      <p style="margin:0 0 24px;font-size:13px;color:#57534e">%s</p>
      <p style="margin:0;font-size:13px;color:#57534e">— PianoML</p>
      </div></body></html>
      """.formatted(
        HtmlUtils.htmlEscape(locale), HtmlUtils.htmlEscape(greeting), HtmlUtils.htmlEscape(t.getProperty("intro")),
        href, HtmlUtils.htmlEscape(t.getProperty("button")),
        HtmlUtils.htmlEscape(t.getProperty("link_hint")), href, href,
        HtmlUtils.htmlEscape(t.getProperty("expiry")), HtmlUtils.htmlEscape(t.getProperty("ignore")));
    return new Message(t.getProperty("subject"), html, text);
  }

  private Properties texts(String locale) {
    Properties t = texts.computeIfAbsent(locale, PasswordResetMail::load);
    return t.isEmpty() ? texts.computeIfAbsent(FALLBACK, PasswordResetMail::load) : t;
  }

  /** The texts of a language; empty when it has no file. */
  static Properties load(String locale) {
    Properties properties = new Properties();
    try (InputStream in = PasswordResetMail.class.getResourceAsStream("/mail/password-reset." + locale + ".properties")) {
      if (in != null) properties.load(new InputStreamReader(in, StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return properties;
  }
}
