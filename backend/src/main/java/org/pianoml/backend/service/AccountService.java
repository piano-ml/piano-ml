package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.SystemUsers;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.exception.UserAlreadyExistsException;
import org.pianoml.backend.exception.UserNotLoggedInException;
import org.pianoml.backend.mapper.UserMapper;
import org.pianoml.backend.model.AccountCreatePostRequest;
import org.pianoml.backend.model.AccountLoginPostRequest;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.pianoml.backend.entity.Score;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Slf4j
@Service
public class AccountService {

  @Autowired
  private UserRepository userRepository;

  @Autowired
  private PasswordEncoder passwordEncoder;

  @Autowired
  private AuthenticationManager authenticationManager;

  @Autowired
  private JwtTokenProvider tokenProvider;

  @Autowired
  private UserMapper userMapper;

  @Autowired
  private ScoreRepository scoreRepository;

  @Autowired
  private ScoreService scoreService;

  /**
   * Accounts whose scores are purged, instead of handed to the junk user, when the account is deleted. Meant for
   * test accounts (the acceptance suite's account), so test runs leave nothing behind. Comma-separated emails.
   */
  @Value("${pianoml.account.purge-scores-on-delete:acceptance-test@example.com}")
  private List<String> purgeScoresOnDelete = List.of();

  /**
   * Deletes the authenticated user's own account.
   *
   * <p>Scores are kept and handed to the "junk" system user ({@link SystemUsers#JUNK_ID}), except for accounts
   * listed in {@code pianoml.account.purge-scores-on-delete} (test accounts), whose scores are purged. The user row
   * is then deleted and the database removes dependent rows (user_play_count, ON DELETE CASCADE). The score owner
   * foreign key is ON DELETE RESTRICT, so a delete that skipped either step would fail instead of losing scores.
   *
   * @return number of scores moved to the junk user, or purged
   */
  @Transactional
  public int deleteCurrentUser(Authentication authentication) {
    User user = getUserFromAuthentication(authentication);
    if (SystemUsers.JUNK_ID.equals(user.getId())) {
      throw new IllegalStateException("System users cannot be deleted");
    }
    if (!userRepository.existsById(SystemUsers.JUNK_ID)) {
      throw new IllegalStateException("Junk system user is missing (Liquibase changelog 021)");
    }

    if (purgesScoresOnDelete(user)) {
      List<Score> scores = scoreRepository.findByOwnerId(user.getId());
      scores.forEach(scoreService::purgeScore);
      userRepository.delete(user);
      log.info("Deleted account {}; {} score(s) purged (test account)", user.getId(), scores.size());
      return scores.size();
    }

    int moved = scoreRepository.reassignOwner(user.getId(), SystemUsers.JUNK_ID);
    userRepository.delete(user);
    log.info("Deleted account {}; {} score(s) moved to the junk user", user.getId(), moved);
    return moved;
  }

  private boolean purgesScoresOnDelete(User user) {
    return user.getEmail() != null && purgeScoresOnDelete != null && purgeScoresOnDelete.stream()
      .map(String::trim)
      .anyMatch(email -> !email.isEmpty() && email.equalsIgnoreCase(user.getEmail().trim()));
  }

  public User createUser(AccountCreatePostRequest accountCreatePostRequest) {
    if (userRepository.findByEmail(accountCreatePostRequest.getEmail()).isPresent()) {
      throw new UserAlreadyExistsException("User with email " + accountCreatePostRequest.getEmail() + " already exists.");
    }

    User user = userMapper.toUser(accountCreatePostRequest);
    user.setPassword(passwordEncoder.encode(accountCreatePostRequest.getPassword()));
    user.setRoles("USER"); // Default role for new users
    return userRepository.save(user);
  }

  public org.pianoml.backend.model.AccountLoginPost200Response loginUser(AccountLoginPostRequest accountLoginPostRequest) {
    Authentication authentication = authenticationManager.authenticate(
      new UsernamePasswordAuthenticationToken(
        accountLoginPostRequest.getEmail(),
        accountLoginPostRequest.getPassword()
      )
    );

    SecurityContextHolder.getContext().setAuthentication(authentication);

    org.springframework.security.core.userdetails.User userDetails = (org.springframework.security.core.userdetails.User) authentication.getPrincipal();
    User user = userRepository.findByEmail(userDetails.getUsername()).get();
    org.pianoml.backend.model.AccountLoginPost200Response response = new org.pianoml.backend.model.AccountLoginPost200Response();
    response.setToken(tokenProvider.generateToken(user));
    response.setUserId(user.getId().toString());
    response.setUsername(user.getName());
    response.setRoles(user.getRoles());

    return response;
  }


  public User getUserFromAuthentication(Authentication authentication) {
    if (authentication == null || !authentication.isAuthenticated()) {
      throw new RuntimeException("user not authenticated");
    }
    String id = authentication.getName();
    if (Objects.equals(id, "anonymousUser")) {
      throw new UserNotLoggedInException("user not logged in");
    }
    // TODO switch to using userId instead of email
    java.util.Optional<User> userOpt = userRepository.findById(UUID.fromString(id));
    if (userOpt.isEmpty()) {
      throw new UserNotLoggedInException("user not activated");
    }
    return userOpt.get();
  }

  public org.pianoml.backend.model.UserApiInfo getUserApiInfoFromAuthentication(Authentication authentication) {
    return userMapper.toUserApiInfo(getUserFromAuthentication(authentication));
  }

  public void updateUserInfo(org.pianoml.backend.model.UserApiInfo userApiInfo) {
    User user = getUserFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
    user.setName(userApiInfo.getName());
    userRepository.save(user);
  }

  public String renewToken(String token) {
    if (token == null || token.trim().isEmpty()) {
      throw new IllegalArgumentException("token is required");
    }
    // Validate token
    if (!tokenProvider.validateToken(token)) {
      throw new RuntimeException("Invalid or expired token");
    }
    String userId = tokenProvider.getUserIdFromJWT(token);
    User user = userRepository.findById(UUID.fromString(userId)).orElseThrow(() -> new RuntimeException("User not found"));
    return tokenProvider.generateToken(user);
  }
}
