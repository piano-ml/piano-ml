package org.pianoml.backend.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Sends emails through the Resend API (https://resend.com/docs/api-reference/emails/send-email).
 * The key comes from {@code resend.api.key}: application-root.properties locally, the RESEND_API_KEY environment
 * variable in production. Without a key (tests, local runs without it), nothing is sent: the email is logged.
 */
@Slf4j
@Component
public class ResendMailSender implements MailSender {

  private final RestClient client;
  private final String apiKey;
  private final String from;

  public ResendMailSender(@Value("${resend.api.key:}") String apiKey,
                          @Value("${resend.from:PianoML <noreply@pianoml.org>}") String from,
                          @Value("${resend.url:https://api.resend.com}") String url) {
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(Duration.ofSeconds(5));
    requestFactory.setReadTimeout(Duration.ofSeconds(10));
    this.client = RestClient.builder().baseUrl(url).requestFactory(requestFactory).build();
    this.apiKey = apiKey;
    this.from = from;
  }

  @Override
  public void send(String to, String subject, String html, String text) {
    if (apiKey.isBlank()) {
      log.warn("resend.api.key is not set: email \"{}\" to {} not sent:\n{}", subject, to, text);
      return;
    }
    try {
      client.post().uri("/emails")
        .header("Authorization", "Bearer " + apiKey)
        .contentType(MediaType.APPLICATION_JSON)
        .body(Map.of("from", from, "to", List.of(to), "subject", subject, "html", html, "text", text))
        .retrieve()
        .toBodilessEntity();
    } catch (RestClientException e) {
      throw new MailException("Resend could not send \"" + subject + "\": " + e.getMessage(), e);
    }
  }
}
