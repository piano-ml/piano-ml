package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.AfterEach;
import org.mockito.Spy;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.mapper.UriMapper;
import org.pianoml.backend.mapper.UserMapper;
import org.pianoml.backend.mapper.UserMapperImpl;
import org.pianoml.backend.model.AccountCreatePostRequest;
import org.pianoml.backend.model.UserApiInfo;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

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

  @Mock
  private PasswordEncoder passwordEncoder;

  @Spy
  private UserMapper userMapper = realUserMapper();

  private static UserMapper realUserMapper() {
    UserMapperImpl impl = new UserMapperImpl();
    ReflectionTestUtils.setField(impl, "uriMapper", new UriMapper());
    return impl;
  }

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

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

  @Test
  public void createUser_alwaysAssignsDefaultUserRole() {
    AccountCreatePostRequest request = new AccountCreatePostRequest();
    request.setEmail("bob@example.com");
    request.setName("bob");
    request.setPassword("pw");
    when(userRepository.findByEmail("bob@example.com")).thenReturn(Optional.empty());
    when(passwordEncoder.encode("pw")).thenReturn("hashed");
    when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

    User created = accountService.createUser(request);

    assertEquals("USER", created.getRoles());
  }

  @Test
  public void updateUserInfo_ignoresRolesInPayload() {
    UUID id = UUID.randomUUID();
    User stored = new User();
    stored.setId(id);
    stored.setName("bob");
    stored.setRoles("USER");
    when(userRepository.findById(id)).thenReturn(Optional.of(stored));
    SecurityContextHolder.getContext().setAuthentication(
      new UsernamePasswordAuthenticationToken(id.toString(), null, List.of()));

    UserApiInfo payload = new UserApiInfo();
    payload.setName("bobby");
    payload.setRoles("USER,ADMIN");

    accountService.updateUserInfo(payload);

    verify(userRepository).save(stored);
    assertEquals("USER", stored.getRoles());
    assertEquals("bobby", stored.getName());
  }

  @Test
  public void getUserApiInfo_exposesRoles() {
    UUID id = UUID.randomUUID();
    User stored = new User();
    stored.setId(id);
    stored.setName("admin");
    stored.setRoles("USER,ADMIN");
    when(userRepository.findById(id)).thenReturn(Optional.of(stored));

    UserApiInfo info = accountService.getUserApiInfoFromAuthentication(
      new UsernamePasswordAuthenticationToken(id.toString(), null, List.of()));

    assertEquals("USER,ADMIN", info.getRoles());
  }
}
