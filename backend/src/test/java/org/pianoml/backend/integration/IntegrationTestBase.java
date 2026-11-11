package org.pianoml.backend.integration;

import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.AuthorRepository;
import org.pianoml.backend.repository.GenreRepository;
import org.pianoml.backend.repository.GenreTreeRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserPlayCountRepository;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.repository.WorkloadRepository;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.CloudRunJobService;
import org.pianoml.backend.service.PackService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestTemplate;
import software.amazon.awssdk.services.s3.S3Client;
import tools.jackson.databind.ObjectMapper;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.BDDMockito.given;

/**
 * Endpoint integration tests: the whole application context runs (MVC, security filters and real JWTs,
 * controllers, services, mappers, exception handlers), with every boundary to the outside world mocked:
 * <ul>
 *   <li>the database: every Spring Data repository is a mock, stubbed per test and verified for what the
 *       services read and write;</li>
 *   <li>S3, the MusicBrainz HTTP API (RestTemplate), Cloud Run jobs, and {@link PackService}, which runs the
 *       conversion shell scripts (MuseScore, homr...).</li>
 * </ul>
 * All the integration test classes extend this base and declare no other mock, so they share one cached
 * Spring context.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTestBase {

  // --- database ------------------------------------------------------------------------------------------
  @MockitoBean protected UserRepository userRepository;
  @MockitoBean protected ScoreRepository scoreRepository;
  @MockitoBean protected AuthorRepository authorRepository;
  @MockitoBean protected GenreRepository genreRepository;
  @MockitoBean protected GenreTreeRepository genreTreeRepository;
  @MockitoBean protected UserPlayCountRepository userPlayCountRepository;
  @MockitoBean protected WorkloadRepository workloadRepository;
  @MockitoBean protected YoutubeRankRepository youtubeRankRepository;

  // --- external systems ----------------------------------------------------------------------------------
  @MockitoBean protected S3Client s3Client;
  @MockitoBean protected RestTemplate restTemplate;
  @MockitoBean protected CloudRunJobService cloudRunJobService;
  @MockitoBean protected PackService packService;

  @Autowired protected MockMvc mockMvc;
  @Autowired protected JwtTokenProvider jwtTokenProvider;
  @Autowired protected PasswordEncoder passwordEncoder;
  @Autowired protected ObjectMapper objectMapper;

  /** A user as stored in the database (roles "USER" or "USER,ADMIN"). */
  protected static User user(String name, String roles) {
    User user = new User();
    user.setId(UUID.randomUUID());
    user.setEmail(name.toLowerCase() + "@example.com");
    user.setName(name);
    user.setPassword("{noop}unused");
    user.setRoles(roles);
    return user;
  }

  /**
   * "Bearer &lt;JWT&gt;" for this user: a real token signed by the application, whose user the JWT filter
   * loads from the (mocked) repository. Bearer requests are exempt from CSRF, like scripts and tools.
   */
  protected String bearer(User user) {
    given(userRepository.findById(user.getId())).willReturn(Optional.of(user));
    return "Bearer " + jwtTokenProvider.generateToken(user);
  }

  protected String json(Object value) {
    return objectMapper.writeValueAsString(value);
  }
}
