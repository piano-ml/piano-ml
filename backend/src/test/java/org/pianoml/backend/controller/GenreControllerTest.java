package org.pianoml.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.GenreApiInfo;
import org.pianoml.backend.service.GenreService;
import org.pianoml.backend.service.AuthorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class GenreControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private GenreService genreService;

    @Autowired
    private ObjectMapper objectMapper;

//    @Test
//    public void testGetGenreById() throws Exception {
//        UUID genreId = UUID.randomUUID();
//        GenreApiInfo genre = new GenreApiInfo();
//        genre.setId(genreId.toString());
//        genre.setName("Classical");
//
//        given(genreService.getGenre(genreId)).willReturn(Optional.of(genre));
//
//        mockMvc.perform(get("/genre/{id}", genreId))
//                .andExpect(status().isOk())
//                .andExpect(jsonPath("$.id").value(genreId.toString()))
//                .andExpect(jsonPath("$.name").value("Classical"));
//    }

//    @Test
//    public void testGetGenreByIdNotFound() throws Exception {
//        UUID genreId = UUID.randomUUID();
//        given(genreService.getGenre(genreId)).willReturn(Optional.empty());
//        mockMvc.perform(get("/genre/{id}", genreId))
//                .andExpect(status().isNotFound());
//    }

//    @Test
//    public void testGetAllGenres() throws Exception {
//        GenreApiInfo genre = new GenreApiInfo();
//        genre.setId(UUID.randomUUID().toString());
//        genre.setName("Classical");
//
//        List<GenreApiInfo> allGenres = Collections.singletonList(genre);
//
//        given(genreService.getAllGenres()).willReturn(allGenres);
//
//        mockMvc.perform(get("/genre"))
//                .andExpect(status().isOk())
//                .andExpect(jsonPath("$[0].name").value("Classical"));
//    }

    @Test
    //@WithMockUser(roles = "ADMIN")
    public void testCreateGenres() throws Exception {
        GenreApiInfo genreToCreate = new GenreApiInfo();
        genreToCreate.setName("Jazz");

        GenreApiInfo createdGenre = new GenreApiInfo();
        createdGenre.setId(UUID.randomUUID().toString());
        createdGenre.setName("Jazz");

        given(genreService.createGenre(any())).willReturn(createdGenre);

        mockMvc.perform(post("/genre")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(genreToCreate)))
                .andExpect(status().isForbidden());
                //.andExpect(jsonPath("$[0].id").exists())
                //.andExpect(jsonPath("$[0].name").value("Jazz"));
    }

    @Test
    //@WithMockUser(roles = "ADMIN")
    public void testUpdateGenre() throws Exception {
        UUID genreId = UUID.randomUUID();
        GenreApiInfo genreToUpdate = new GenreApiInfo();
        genreToUpdate.setName("Blues");

        GenreApiInfo updatedGenre = new GenreApiInfo();
        updatedGenre.setId(genreId.toString());
        updatedGenre.setName("Blues");

        given(genreService.updateGenre(any(UUID.class), any(GenreApiInfo.class))).willReturn(Optional.of(updatedGenre));

        mockMvc.perform(put("/genre/{id}", genreId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(genreToUpdate)))
                .andExpect(status().isForbidden());
                //.andExpect(jsonPath("$.id").value(genreId.toString()))
                //.andExpect(jsonPath("$.name").value("Blues"));
    }

//    @Test
//    public void testSearchGenres() throws Exception {
//        GenreApiInfo genre = new GenreApiInfo();
//        genre.setId(UUID.randomUUID().toString());
//        genre.setName("Rock");
//
//        given(genreService.searchGenres("Rock")).willReturn(Collections.singletonList(genre));
//
//        mockMvc.perform(get("/genre/search/Rock"))
//                .andExpect(status().isOk())
//                .andExpect(jsonPath("$[0].name").value("Rock"));
//    }
}
