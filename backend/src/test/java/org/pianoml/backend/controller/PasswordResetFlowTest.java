package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.mail.MailSender;
import org.pianoml.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Password reset by email, end to end on the real (H2) database, with the email sender mocked. */
@SpringBootTest
@AutoConfigureMockMvc
class PasswordResetFlowTest {

  private static final Pattern LINK = Pattern.compile("(https://pianoml\\.org(?:/[a-z]+)?/account/reset-password\\?token=)(\\S+)");

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JdbcTemplate jdbc;

  @Autowired
  private UserRepository userRepository;

  @Autowired
  private PasswordEncoder passwordEncoder;

  @MockitoBean
  private MailSender mailSender;

  private final List<UUID> createdUsers = new ArrayList<>();

  @AfterEach
  void cleanup() {
    for (UUID id : createdUsers) jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", id);
  }

  private User newUser(String locale) {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("reset-" + UUID.randomUUID());
    user.setPassword(passwordEncoder.encode("old-password"));
    user.setRoles("USER");
    user.setLocale(locale);
    User saved = userRepository.save(user);
    createdUsers.add(saved.getId());
    return saved;
  }

  private ResultActions forgot(String email, String locale) throws Exception {
    String body = locale == null ? "{\"email\":\"" + email + "\"}" : "{\"email\":\"" + email + "\",\"locale\":\"" + locale + "\"}";
    return mockMvc.perform(post("/account/password/forgot").contentType(MediaType.APPLICATION_JSON).content(body));
  }

  private ResultActions reset(String token, String password) throws Exception {
    return mockMvc.perform(post("/account/password/reset").contentType(MediaType.APPLICATION_JSON)
      .content("{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}"));
  }

  private ResultActions login(User user, String password) throws Exception {
    return mockMvc.perform(post("/account/login").contentType(MediaType.APPLICATION_JSON)
      .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + password + "\"}"));
  }

  /** The link of the only email sent to this address: {page, token}. */
  private String[] sentLink(String to) {
    ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
    verify(mailSender).send(eq(to), anyString(), anyString(), text.capture());
    Matcher m = LINK.matcher(text.getValue());
    assertThat(m.find()).as("a reset link in:\n%s", text.getValue()).isTrue();
    return new String[]{m.group(1), m.group(2)};
  }

  private int tokensOf(User user) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.password_reset_token WHERE user_id = ?", Integer.class, user.getId());
  }

  /** The user's links still valid. */
  private int validTokensOf(User user) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.password_reset_token WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP",
      Integer.class, user.getId());
  }

  @Test
  void theLinkSetsANewPassword_once() throws Exception {
    User user = newUser("fr");

    forgot(user.getEmail(), "de").andExpect(status().isNoContent());

    ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
    verify(mailSender).send(eq(user.getEmail()), subject.capture(), anyString(), anyString());
    assertThat(subject.getValue()).isEqualTo("Réinitialisez votre mot de passe PianoML"); // the account's language
    String[] link = sentLink(user.getEmail());
    assertThat(link[0]).isEqualTo("https://pianoml.org/fr/account/reset-password?token=");
    String token = link[1];
    String storedHash = jdbc.queryForObject("SELECT token_hash FROM pianoml.password_reset_token WHERE user_id = ?",
      String.class, user.getId());
    assertThat(storedHash).hasSize(64).isNotEqualTo(token);
    var lifetime = jdbc.queryForMap("SELECT created_at, expires_at FROM pianoml.password_reset_token WHERE user_id = ?", user.getId());
    assertThat(java.time.Duration.between(((java.time.OffsetDateTime) lifetime.get("created_at")),
      ((java.time.OffsetDateTime) lifetime.get("expires_at")))).isEqualTo(java.time.Duration.ofDays(7));

    reset(token, "new-password").andExpect(status().isNoContent());

    login(user, "new-password").andExpect(status().isOk());
    login(user, "old-password").andExpect(status().isForbidden());
    assertThat(userRepository.findById(user.getId()).orElseThrow().isVerified()).isTrue();
    assertThat(validTokensOf(user)).isZero();
    reset(token, "another-password").andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_token"));
  }

  @Test
  void anAccountWithoutALanguageGetsTheEmailInTheLanguageOfTheRequest() throws Exception {
    User user = newUser(null);

    forgot(user.getEmail(), "zh-Hans").andExpect(status().isNoContent());

    assertThat(sentLink(user.getEmail())[0]).isEqualTo("https://pianoml.org/zh/account/reset-password?token=");
  }

  @Test
  void anEnglishLinkHasNoLanguagePrefix() throws Exception {
    User user = newUser("en");

    forgot(user.getEmail(), null).andExpect(status().isNoContent());

    assertThat(sentLink(user.getEmail())[0]).isEqualTo("https://pianoml.org/account/reset-password?token=");
  }

  @Test
  void anUnknownEmailGetsTheSameAnswer_andNoEmail() throws Exception {
    forgot("nobody-" + UUID.randomUUID() + "@example.com", "en").andExpect(status().isNoContent());

    verify(mailSender, never()).send(any(), any(), any(), any());
  }

  @Test
  void atMostThreeEmailsPerAccountIn24Hours_andOnlyTheLastLinkWorks() throws Exception {
    User user = newUser("en");

    for (int i = 0; i < 4; i++) forgot(user.getEmail(), null).andExpect(status().isNoContent());

    ArgumentCaptor<String> texts = ArgumentCaptor.forClass(String.class);
    verify(mailSender, times(3)).send(eq(user.getEmail()), any(), any(), texts.capture());
    assertThat(tokensOf(user)).isEqualTo(3);
    assertThat(validTokensOf(user)).isEqualTo(1);
    List<String> tokens = texts.getAllValues().stream().map(t -> { Matcher m = LINK.matcher(t); m.find(); return m.group(2); }).toList();
    reset(tokens.get(0), "new-password").andExpect(status().isBadRequest());
    reset(tokens.get(2), "new-password").andExpect(status().isNoContent());
  }

  @Test
  void aResetDoesNotRestartTheDailyCount() throws Exception {
    User user = newUser("en");
    forgot(user.getEmail(), null).andExpect(status().isNoContent());
    reset(sentLink(user.getEmail())[1], "new-password").andExpect(status().isNoContent());

    forgot(user.getEmail(), null).andExpect(status().isNoContent());
    forgot(user.getEmail(), null).andExpect(status().isNoContent());
    forgot(user.getEmail(), null).andExpect(status().isNoContent());

    verify(mailSender, times(3)).send(eq(user.getEmail()), any(), any(), any());
  }

  @Test
  void emailsSentMoreThan24HoursAgoNoLongerCount_andTheirRowsGo() throws Exception {
    User user = newUser("en");
    for (int i = 0; i < 3; i++) {
      jdbc.update("INSERT INTO pianoml.password_reset_token (id, user_id, token_hash, created_at, expires_at) "
          + "VALUES (?, ?, ?, DATEADD('HOUR', -25, CURRENT_TIMESTAMP), DATEADD('HOUR', -25, CURRENT_TIMESTAMP))",
        UUID.randomUUID(), user.getId(), String.valueOf(i).repeat(64));
    }

    forgot(user.getEmail(), null).andExpect(status().isNoContent());

    verify(mailSender).send(eq(user.getEmail()), any(), any(), any());
    assertThat(tokensOf(user)).isEqualTo(1);
  }

  @Test
  void aNewLinkEndsThePreviousOne() throws Exception {
    User user = newUser("en");
    UUID old = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.password_reset_token (id, user_id, token_hash, created_at, expires_at) "
      + "VALUES (?, ?, ?, DATEADD('MINUTE', -5, CURRENT_TIMESTAMP), DATEADD('MINUTE', 55, CURRENT_TIMESTAMP))",
      old, user.getId(), "a".repeat(64));

    forgot(user.getEmail(), null).andExpect(status().isNoContent());

    assertThat(validTokensOf(user)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pianoml.password_reset_token WHERE id = ? AND expires_at > CURRENT_TIMESTAMP",
      Integer.class, old)).isZero();
  }

  @Test
  void anExpiredLinkNoLongerWorks() throws Exception {
    User user = newUser("en");
    String token = "expired-token-" + UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.password_reset_token (id, user_id, token_hash, created_at, expires_at) "
      + "VALUES (?, ?, ?, DATEADD('HOUR', -2, CURRENT_TIMESTAMP), DATEADD('HOUR', -1, CURRENT_TIMESTAMP))",
      UUID.randomUUID(), user.getId(), org.pianoml.backend.service.PasswordResetServiceAccess.hash(token));

    reset(token, "new-password").andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_token"));
    login(user, "old-password").andExpect(status().isOk());
  }

  @Test
  void anUnknownTokenOrAShortPasswordIsABadRequest() throws Exception {
    reset("not-a-token", "new-password").andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_token"));
    reset("not-a-token", "short").andExpect(status().isBadRequest());
  }

  @Test
  void anEmailThatCannotBeSentIsAnError_andKeepsNoLink() throws Exception {
    User user = newUser("en");
    willThrow(new MailSender.MailException("Resend down", null)).given(mailSender).send(any(), any(), any(), any());

    forgot(user.getEmail(), null).andExpect(status().isInternalServerError());

    assertThat(tokensOf(user)).isZero();
  }

  @Test
  void theLinksGoAwayWithTheAccount() throws Exception {
    User user = newUser("en");
    forgot(user.getEmail(), null).andExpect(status().isNoContent());

    jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", user.getId());

    assertThat(tokensOf(user)).isZero();
  }
}
