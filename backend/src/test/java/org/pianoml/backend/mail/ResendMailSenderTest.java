package org.pianoml.backend.mail;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** ResendMailSender against a local stand-in for the Resend API. */
class ResendMailSenderTest {

  private HttpServer server;
  private final AtomicReference<String> authorization = new AtomicReference<>();
  private final AtomicReference<String> body = new AtomicReference<>();
  private final AtomicInteger requests = new AtomicInteger();
  private volatile int status = 200;

  @BeforeEach
  void start() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/emails", exchange -> {
      requests.incrementAndGet();
      authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
      body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
      byte[] answer = "{\"id\":\"x\"}".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(status, answer.length);
      exchange.getResponseBody().write(answer);
      exchange.close();
    });
    server.start();
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  private ResendMailSender sender(String key) {
    return new ResendMailSender(key, "PianoML <noreply@pianoml.org>", "http://127.0.0.1:" + server.getAddress().getPort());
  }

  @Test
  void postsTheEmailWithTheApiKey() {
    sender("re_test").send("lily@example.com", "Subject", "<p>Hi</p>", "Hi");

    assertThat(authorization.get()).isEqualTo("Bearer re_test");
    assertThat(body.get()).contains("\"from\":\"PianoML <noreply@pianoml.org>\"", "\"to\":[\"lily@example.com\"]",
      "\"subject\":\"Subject\"", "\"html\":\"<p>Hi</p>\"", "\"text\":\"Hi\"");
  }

  @Test
  void aRefusalIsAMailException() {
    status = 422;
    assertThatThrownBy(() -> sender("re_test").send("lily@example.com", "Subject", "<p>Hi</p>", "Hi"))
      .isInstanceOf(MailSender.MailException.class);
  }

  @Test
  void withoutAKeyNothingIsSent() {
    sender("").send("lily@example.com", "Subject", "<p>Hi</p>", "Hi");
    assertThat(requests.get()).isZero();
  }
}
