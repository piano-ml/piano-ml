package org.pianoml.backend.mapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.AccountCreatePostRequest;
import org.pianoml.backend.model.UserApiInfo;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class UserMapperTest {

  private UserMapper mapper;

  @BeforeEach
  void setup() {
    mapper = new UserMapperImpl();
    ReflectionTestUtils.setField(mapper, "uriMapper", new UriMapper());
  }

  @Test
  void toUserApiInfo_exposesRoles() {
    User user = new User();
    user.setName("alice");
    user.setRoles("USER,ADMIN");

    UserApiInfo api = mapper.toUserApiInfo(user);

    assertEquals("USER,ADMIN", api.getRoles());
  }

  @Test
  void toUser_fromSignupRequest_neverSetsRoles() {
    AccountCreatePostRequest request = new AccountCreatePostRequest();
    request.setEmail("alice@example.com");
    request.setName("alice");
    request.setPassword("secret");

    User user = mapper.toUser(request);

    assertNull(user.getRoles());
    assertEquals("alice@example.com", user.getEmail());
  }
}
