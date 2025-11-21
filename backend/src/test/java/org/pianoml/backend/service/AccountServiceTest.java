package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class AccountServiceTest {

  @Mock
  private UserRepository userRepository;

  @Mock
  private JwtTokenProvider tokenProvider;

  @InjectMocks
  private AccountService accountService;

  @Test
  public void renewToken_nullToken_throwsIllegalArgumentException() {
    assertThrows(IllegalArgumentException.class, () -> accountService.renewToken(null));
    assertThrows(IllegalArgumentException.class, () -> accountService.renewToken("   "));
  }

  @Test
  public void renewToken_invalidToken_throwsRuntimeException() {
    String token = "invalid";
    when(tokenProvider.validateToken(token)).thenReturn(false);
    RuntimeException ex = assertThrows(RuntimeException.class, () -> accountService.renewToken(token));
    assertEquals("Invalid or expired token", ex.getMessage());
    verify(tokenProvider).validateToken(token);
  }

  @Test
  public void renewToken_validToken_returnsNewToken() {
    String oldToken = "validToken";
    String userId = UUID.randomUUID().toString();
    User user = new User();
    user.setId(UUID.fromString(userId));
    when(tokenProvider.validateToken(oldToken)).thenReturn(true);
    when(tokenProvider.getUserIdFromJWT(oldToken)).thenReturn(userId);
    when(userRepository.findById(UUID.fromString(userId))).thenReturn(Optional.of(user));
    when(tokenProvider.generateToken(user)).thenReturn("newTokenValue");

    String result = accountService.renewToken(oldToken);
    assertEquals("newTokenValue", result);

    verify(tokenProvider).validateToken(oldToken);
    verify(tokenProvider).getUserIdFromJWT(oldToken);
    verify(userRepository).findById(UUID.fromString(userId));
    verify(tokenProvider).generateToken(user);
  }
}

