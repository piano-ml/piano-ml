package org.pianoml.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.service.AuthorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Collections;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthorController.class)
public class AuthorControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
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

        given(authorService.createAuthor(any(AuthorApiInfo.class))).willReturn(createdAuthor);

        mockMvc.perform(post("/author")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(authorToCreate)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.name").value("Jane Doe"));
    }

    @Test
    public void testUpdateAuthor() throws Exception {
        UUID authorId = UUID.randomUUID();
        AuthorApiInfo authorToUpdate = new AuthorApiInfo();
        authorToUpdate.setName("John Smith");

        AuthorApiInfo updatedAuthor = new AuthorApiInfo();
        updatedAuthor.setId(authorId.toString());
        updatedAuthor.setName("John Smith");

        given(authorService.updateAuthor(any(UUID.class), any(AuthorApiInfo.class))).willReturn(Optional.of(updatedAuthor));

        mockMvc.perform(put("/author/{id}", authorId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(authorToUpdate)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(authorId.toString()))
                .andExpect(jsonPath("$.name").value("John Smith"));
    }

    @Test
    public void testSearchAuthors() throws Exception {
        AuthorApiInfo author = new AuthorApiInfo();
        author.setId(UUID.randomUUID().toString());
        author.setName("Test Author");

        given(authorService.searchAuthors("Test")).willReturn(Collections.singletonList(author));

        mockMvc.perform(get("/author/search?query=Test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Test Author"));
    }
}
