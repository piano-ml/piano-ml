package org.pianoml.backend.controller;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.service.AuthorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class AuthorControllerTest {

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private AuthorService authorService;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  public void testGetAuthorById() throws Exception {
    UUID authorId = UUID.randomUUID();
    AuthorApiInfo author = new AuthorApiInfo();
    author.setId(authorId.toString());
    author.setName("John Doe");

    given(authorService.getAuthor(authorId)).willReturn(Optional.of(author));

    mockMvc.perform(get("/author/{id}", authorId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.id").value(authorId.toString()))
      .andExpect(jsonPath("$.name").value("John Doe"));
  }

  @Test
  public void testGetAuthorByIdNotFound() throws Exception {
    UUID authorId = UUID.randomUUID();
    given(authorService.getAuthor(authorId)).willReturn(Optional.empty());

    mockMvc.perform(get("/author/{id}", authorId))
      .andExpect(status().isNotFound());
  }

  @Test
  public void testCreateAuthor() throws Exception {
    AuthorApiInfo authorToCreate = new AuthorApiInfo();
    authorToCreate.setName("Jane Doe");

    AuthorApiInfo createdAuthor = new AuthorApiInfo();
    createdAuthor.setId(UUID.randomUUID().toString());
    createdAuthor.setName("Jane Doe");

    given(authorService.createAuthor(any(AuthorApiInfo.class), anyBoolean())).willReturn(createdAuthor);

    mockMvc.perform(post("/author")
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(authorToCreate)))
      .andExpect(status().isForbidden());
    //.andExpect(jsonPath("$.id").exists())
    //.andExpect(jsonPath("$.name").value("Jane Doe"));
  }

  @Test
  public void testUpdateAuthor() throws Exception {
    UUID authorId = UUID.randomUUID();
    AuthorApiInfo authorToUpdate = new AuthorApiInfo();
    authorToUpdate.setName("John Smith");

    AuthorApiInfo updatedAuthor = new AuthorApiInfo();
    updatedAuthor.setId(authorId.toString());
    updatedAuthor.setName("John Smith");

    given(authorService.updateAuthor(any(UUID.class), any(AuthorApiInfo.class), anyBoolean())).willReturn(Optional.of(updatedAuthor));

    mockMvc.perform(put("/author/{id}", authorId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(authorToUpdate)))
      .andExpect(status().isForbidden());
    //.andExpect(jsonPath("$.id").value(authorId.toString()))
    //.andExpect(jsonPath("$.name").value("John Smith"));
  }

  private String editorialPayload() throws Exception {
    AuthorApiInfo body = new AuthorApiInfo();
    body.setMbid(UUID.randomUUID().toString());
    body.setDescription("d");
    body.setImage("https://img.example/x.jpg");
    body.setImageHq("https://img.example/x-hq.jpg");
    return objectMapper.writeValueAsString(body);
  }

  @Test
  @WithMockUser(roles = "USER")
  public void createAuthor_asUser_isAllowed_andPassesNonAdmin() throws Exception {
    given(authorService.createAuthor(any(AuthorApiInfo.class), anyBoolean())).willReturn(new AuthorApiInfo());

    mockMvc.perform(post("/author").contentType(MediaType.APPLICATION_JSON).content(editorialPayload()))
      .andExpect(status().isCreated());
    verify(authorService).createAuthor(any(AuthorApiInfo.class), eq(false));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  public void createAuthor_asAdmin_passesAdmin() throws Exception {
    given(authorService.createAuthor(any(AuthorApiInfo.class), anyBoolean())).willReturn(new AuthorApiInfo());

    mockMvc.perform(post("/author").contentType(MediaType.APPLICATION_JSON).content(editorialPayload()))
      .andExpect(status().isCreated());
    verify(authorService).createAuthor(any(AuthorApiInfo.class), eq(true));
  }

  @Test
  @WithMockUser(roles = "USER")
  public void updateAuthor_asUser_passesNonAdmin() throws Exception {
    UUID id = UUID.randomUUID();
    given(authorService.updateAuthor(any(UUID.class), any(AuthorApiInfo.class), anyBoolean()))
      .willReturn(Optional.of(new AuthorApiInfo()));

    mockMvc.perform(put("/author/{id}", id).contentType(MediaType.APPLICATION_JSON).content(editorialPayload()))
      .andExpect(status().isOk());
    verify(authorService).updateAuthor(eq(id), any(AuthorApiInfo.class), eq(false));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  public void updateAuthor_asAdmin_passesAdmin() throws Exception {
    UUID id = UUID.randomUUID();
    given(authorService.updateAuthor(any(UUID.class), any(AuthorApiInfo.class), anyBoolean()))
      .willReturn(Optional.of(new AuthorApiInfo()));

    mockMvc.perform(put("/author/{id}", id).contentType(MediaType.APPLICATION_JSON).content(editorialPayload()))
      .andExpect(status().isOk());
    verify(authorService).updateAuthor(eq(id), any(AuthorApiInfo.class), eq(true));
  }

//    @Test
//    public void testSearchAuthors() throws Exception {
//        AuthorApiInfo author = new AuthorApiInfo();
//        author.setId(UUID.randomUUID().toString());
//        author.setName("Test Author");
//
//        given(authorService.searchAuthors("Test")).willReturn(Collections.singletonList(author));
//
//        mockMvc.perform(get("/author/search?query=Test"))
//                .andExpect(status().isOk())
//                .andExpect(jsonPath("$[0].name").value("Test Author"));
//    }
}
