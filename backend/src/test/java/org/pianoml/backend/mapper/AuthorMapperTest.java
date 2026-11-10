package org.pianoml.backend.mapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.model.AuthorApiInfo;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class AuthorMapperTest {

  private AuthorMapper mapper;

  @BeforeEach
  void setup() {
    mapper = new AuthorMapperImpl();
    ReflectionTestUtils.setField(mapper, "uriMapper", new UriMapper());
  }

  @Test
  void toAuthorApiInfo_mapsImages() {
    Author author = new Author();
    author.setImage("https://img.example/a.jpg");
    author.setImageHq("https://img.example/a-hq.jpg");

    AuthorApiInfo api = mapper.toAuthorApiInfo(author);

    assertEquals("https://img.example/a.jpg", api.getImage());
    assertEquals("https://img.example/a-hq.jpg", api.getImageHq());
  }

  @Test
  void toAuthor_mapsImages() {
    AuthorApiInfo api = new AuthorApiInfo();
    api.setImage("https://img.example/b.jpg");
    api.setImageHq("https://img.example/b-hq.jpg");

    Author author = mapper.toAuthor(api);

    assertEquals("https://img.example/b.jpg", author.getImage());
    assertEquals("https://img.example/b-hq.jpg", author.getImageHq());
  }

  @Test
  void toAuthorApiInfo_withoutImages_leavesThemNull() {
    AuthorApiInfo api = mapper.toAuthorApiInfo(new Author());

    assertNull(api.getImage());
    assertNull(api.getImageHq());
  }
}
