package org.pianoml.backend.integration;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.GenreTree;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.Workload;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /author, /genre, /genre_tree and /workload endpoints, with real services and the database mocked. */
class CatalogIntegrationTest extends IntegrationTestBase {

  private final User member = user("Member", "USER");
  private final User admin = user("Admin", "USER,ADMIN");

  private static Author ravel() {
    Author author = new Author();
    author.setId(UUID.randomUUID());
    author.setMbid(UUID.randomUUID());
    author.setName("Maurice Ravel");
    author.setSortName("Ravel, Maurice");
    author.setSlug("ravel-maurice");
    author.setDescription("French composer");
    return author;
  }

  // =========================================================================================================
  @Nested
  class Authors {
    @Test
    void getReturnsTheAuthorByItsMusicBrainzId() throws Exception {
      Author ravel = ravel();
      given(authorRepository.findByMbid(ravel.getMbid())).willReturn(Optional.of(ravel));

      mockMvc.perform(get("/author/" + ravel.getMbid()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Maurice Ravel"))
        .andExpect(jsonPath("$.slug").value("ravel-maurice"));
    }

    @Test
    void getAnswers404ForAnUnknownAuthor() throws Exception {
      given(authorRepository.findByMbid(any())).willReturn(Optional.empty());
      mockMvc.perform(get("/author/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }

    @Test
    void searchMatchesNames() throws Exception {
      given(authorRepository.searchByNameIlike("rav")).willReturn(List.of(ravel()));
      mockMvc.perform(get("/author/search/rav"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].name").value("Maurice Ravel"));
    }

    @Nested
    class Create {
      private final UUID mbid = UUID.randomUUID();
      private final String body = "{\"mbid\":\"" + mbid + "\",\"description\":\"Edited\",\"imageHq\":\"https://img/r.jpg\"}";

      @Test
      void reusesAnAuthorAlreadyKnown_ignoringEditorialFieldsFromAMember() throws Exception {
        Author known = ravel();
        known.setMbid(mbid);
        given(authorRepository.findByMbid(mbid)).willReturn(Optional.of(known));

        mockMvc.perform(post("/author").header("Authorization", bearer(member)).contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.description").value("French composer"));

        verify(authorRepository, never()).save(any());
        verify(restTemplate, never()).getForObject(anyString(), eq(String.class));
      }

      @Test
      void fetchesANewAuthorFromMusicBrainz_andSavesItWithASlug() throws Exception {
        given(authorRepository.findByMbid(mbid)).willReturn(Optional.empty());
        given(restTemplate.getForObject("https://musicbrainz.org/ws/2/artist/" + mbid + "?fmt=json", String.class))
          .willReturn("{\"id\":\"" + mbid + "\",\"name\":\"Erik Satie\",\"sort-name\":\"Satie, Erik\",\"country\":\"FR\","
            + "\"life-span\":{\"begin\":\"1866-05\",\"end\":\"1925\",\"ended\":true},\"end-area\":{\"name\":\"Paris\"}}");

        mockMvc.perform(post("/author").header("Authorization", bearer(member)).contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.name").value("Erik Satie"))
          .andExpect(jsonPath("$.description").doesNotExist()); // editorial field: admins only

        ArgumentCaptor<Author> saved = ArgumentCaptor.forClass(Author.class);
        verify(authorRepository).save(saved.capture());
        assertThat(saved.getValue().getId()).isNull();
        assertThat(saved.getValue().getSlug()).isEqualTo("satie-erik");
        assertThat(saved.getValue().getLifeSpanBegin()).isEqualTo(LocalDate.of(1866, 5, 1)); // lenient "1866-05"
        assertThat(saved.getValue().getLifeSpanEnd()).isEqualTo(LocalDate.of(1925, 1, 1));
      }

      @Test
      void appliesEditorialFieldsForAnAdmin() throws Exception {
        Author known = ravel();
        known.setMbid(mbid);
        given(authorRepository.findByMbid(mbid)).willReturn(Optional.of(known));
        given(authorRepository.save(any(Author.class))).willAnswer(call -> call.getArgument(0));

        mockMvc.perform(post("/author").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.description").value("Edited"))
          .andExpect(jsonPath("$.imageHq").value("https://img/r.jpg"));
        verify(authorRepository).save(known);
      }

      @Test
      void answers404WhenMusicBrainzDoesNotKnowTheArtist() throws Exception {
        given(authorRepository.findByMbid(mbid)).willReturn(Optional.empty());
        given(restTemplate.getForObject(anyString(), eq(String.class))).willReturn(null);

        mockMvc.perform(post("/author").header("Authorization", bearer(member)).contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.error.message").value("MusicBrainz returned no author for mbid: " + mbid));
        verify(authorRepository, never()).save(any());
      }

      @Test
      void needsALogin() throws Exception {
        mockMvc.perform(post("/author").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isUnauthorized());
      }
    }

    @Nested
    class Update {
      // NOTE: PUT /author/{mbid} looks the author up by its internal id (findById), unlike GET (findByMbid)
      @Test
      void aMemberCanRenameButNotEditEditorialFields() throws Exception {
        Author ravel = ravel();
        given(authorRepository.findById(ravel.getId())).willReturn(Optional.of(ravel));
        given(authorRepository.save(any(Author.class))).willAnswer(call -> call.getArgument(0));

        mockMvc.perform(put("/author/" + ravel.getId()).header("Authorization", bearer(member))
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"M. Ravel\",\"description\":\"Hacked\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.name").value("M. Ravel"))
          .andExpect(jsonPath("$.description").value("French composer"));
      }

      @Test
      void anAdminEditsEditorialFields_keepingOmittedOnes() throws Exception {
        Author ravel = ravel();
        ravel.setImage("https://img/old.jpg");
        given(authorRepository.findById(ravel.getId())).willReturn(Optional.of(ravel));
        given(authorRepository.save(any(Author.class))).willAnswer(call -> call.getArgument(0));

        mockMvc.perform(put("/author/" + ravel.getId()).header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content("{\"description\":\"Impressionist\",\"composerBioLink\":\"https://en.wikipedia.org/wiki/Ravel\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.name").value("Maurice Ravel"))
          .andExpect(jsonPath("$.description").value("Impressionist"))
          .andExpect(jsonPath("$.composerBioLink").value("https://en.wikipedia.org/wiki/Ravel"))
          .andExpect(jsonPath("$.image").value("https://img/old.jpg"));
      }

      @Test
      void answers404ForAnUnknownAuthor() throws Exception {
        given(authorRepository.findById(any())).willReturn(Optional.empty());
        mockMvc.perform(put("/author/" + UUID.randomUUID()).header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"X\"}"))
          .andExpect(status().isNotFound());
        verify(authorRepository, never()).save(any());
      }
    }
  }

  // =========================================================================================================
  @Nested
  class Genres {
    private final UUID jazzId = UUID.randomUUID();
    private final UUID jazzMbid = UUID.randomUUID();

    private Object[] jazzRow(long scores) {
      return new Object[] {jazzId, jazzMbid, "jazz", scores, "Swing and blues"};
    }

    @Test
    void listsAllGenresWithTheirScoreCount() throws Exception {
      given(genreRepository.findAllWithScoreCountRaw()).willReturn(List.<Object[]>of(jazzRow(12), new Object[] {UUID.randomUUID(), null, "pop", null}));

      mockMvc.perform(get("/genre"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].name").value("jazz"))
        .andExpect(jsonPath("$[0].scoreCount").value(12))
        .andExpect(jsonPath("$[0].description").value("Swing and blues"))
        .andExpect(jsonPath("$[1].scoreCount").value(0))
        .andExpect(jsonPath("$[1].mbid").doesNotExist());
    }

    @Test
    void getsOneGenreByItsMusicBrainzId() throws Exception {
      given(genreRepository.findByIdWithScoreCountRaw(jazzMbid)).willReturn(Optional.of(jazzRow(3)));
      mockMvc.perform(get("/genre/" + jazzMbid))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(jazzId.toString()))
        .andExpect(jsonPath("$.scoreCount").value(3));
    }

    @Test
    void answers404ForAnUnknownGenre_orAnEmptyRow() throws Exception {
      given(genreRepository.findByIdWithScoreCountRaw(any())).willReturn(Optional.empty());
      mockMvc.perform(get("/genre/" + UUID.randomUUID())).andExpect(status().isNotFound());
      given(genreRepository.findByIdWithScoreCountRaw(any())).willReturn(Optional.of(new Object[0]));
      mockMvc.perform(get("/genre/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }

    @Test
    void searchesByName() throws Exception {
      Genre jazz = new Genre();
      jazz.setId(jazzId);
      jazz.setName("jazz");
      given(genreRepository.findByNameContainingIgnoreCase("jaz")).willReturn(List.of(jazz));
      mockMvc.perform(get("/genre/search/jaz")).andExpect(jsonPath("$[0].name").value("jazz"));
    }

    @Nested
    class Create {
      private String body(String id) {
        return "{" + (id == null ? "" : "\"id\":\"" + id + "\",") + "\"mbid\":\"" + jazzMbid + "\",\"name\":\"jazz\"}";
      }

      @Test
      void anAdminCreatesANewGenre() throws Exception {
        given(genreRepository.findByIdWithScoreCountRaw(jazzMbid)).willReturn(Optional.empty());
        given(genreRepository.save(any(Genre.class))).willAnswer(call -> {
          Genre g = call.getArgument(0);
          g.setId(jazzId);
          return g;
        });

        mockMvc.perform(post("/genre").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(body(null)))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.id").value(jazzId.toString()));

        ArgumentCaptor<Genre> saved = ArgumentCaptor.forClass(Genre.class);
        verify(genreRepository).save(saved.capture());
        assertThat(saved.getValue().getMbid()).isEqualTo(jazzMbid);
        assertThat(saved.getValue().getName()).isEqualTo("jazz");
      }

      @Test
      void answers200WithoutCreatingWhenTheGenreExists() throws Exception {
        given(genreRepository.findByIdWithScoreCountRaw(jazzMbid)).willReturn(Optional.of(jazzRow(1)));
        mockMvc.perform(post("/genre").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(body(null)))
          .andExpect(status().isOk());
        verify(genreRepository, never()).save(any());
      }

      @Test
      void refusesAClientChosenId() throws Exception {
        mockMvc.perform(post("/genre").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(body(jazzId.toString())))
          .andExpect(status().isBadRequest());
        verify(genreRepository, never()).save(any());
      }

      @Test
      void isForAdminsOnly() throws Exception {
        mockMvc.perform(post("/genre").header("Authorization", bearer(member)).contentType(MediaType.APPLICATION_JSON).content(body(null)))
          .andExpect(status().isForbidden());
        verify(genreRepository, never()).save(any());
      }
    }

    @Nested
    class Update {
      // NOTE: PUT /genre/{id} uses the internal id (findById), GET /genre/{id} the MusicBrainz id
      @Test
      void anAdminRenamesAndDescribesAGenre() throws Exception {
        Genre jazz = new Genre();
        jazz.setId(jazzId);
        jazz.setName("jaz");
        given(genreRepository.findById(jazzId)).willReturn(Optional.of(jazz));
        given(genreRepository.save(any(Genre.class))).willAnswer(call -> call.getArgument(0));

        mockMvc.perform(put("/genre/" + jazzId).header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"jazz\",\"description\":\"Swing\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.name").value("jazz"))
          .andExpect(jsonPath("$.description").value("Swing"));
        verify(genreRepository).save(jazz);
      }

      @Test
      void answers404ForAnUnknownGenre() throws Exception {
        given(genreRepository.findById(any())).willReturn(Optional.empty());
        mockMvc.perform(put("/genre/" + jazzId).header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}"))
          .andExpect(status().isNotFound());
      }

      @Test
      void isForAdminsOnly() throws Exception {
        mockMvc.perform(put("/genre/" + jazzId).header("Authorization", bearer(member))
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}"))
          .andExpect(status().isForbidden());
        verify(genreRepository, never()).findById(any());
      }
    }
  }

  // =========================================================================================================
  @Nested
  class GenreTreeEndpoints {
    private final UUID music = UUID.randomUUID();
    private final UUID jazz = UUID.randomUUID();
    private final UUID bebop = UUID.randomUUID();

    private GenreTree node(UUID id, GenreTree parent) {
      GenreTree node = new GenreTree();
      node.setId(id);
      node.setParent(parent);
      return node;
    }

    private Genre named(UUID id, String name) {
      Genre genre = new Genre();
      genre.setId(id);
      genre.setName(name);
      return genre;
    }

    @Test
    void returnsTheWholeTreeWithGenreNames() throws Exception {
      GenreTree root = node(music, null);
      GenreTree child = node(jazz, root);
      given(genreTreeRepository.findAll()).willReturn(List.of(root, child, node(bebop, child)));
      given(genreRepository.findByIdIn(any())).willReturn(List.of(named(music, "music"), named(jazz, "jazz")));

      mockMvc.perform(get("/genre_tree"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].name").value("music"))
        .andExpect(jsonPath("$[0].children[0].name").value("jazz"))
        .andExpect(jsonPath("$[0].children[0].children[0].id").value(bebop.toString()));
    }

    @Test
    void returnsASubtree_orNothingForAnUnknownRoot() throws Exception {
      GenreTree root = node(music, null);
      given(genreTreeRepository.findAll()).willReturn(List.of(root, node(jazz, root)));
      given(genreRepository.findByIdIn(any())).willReturn(List.of());

      mockMvc.perform(get("/genre_tree").param("root_id", jazz.toString()))
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].id").value(jazz.toString()));
      mockMvc.perform(get("/genre_tree").param("root_id", UUID.randomUUID().toString()))
        .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void anAdminAddsANodeUnderAParent() throws Exception {
      given(genreTreeRepository.findById(music)).willReturn(Optional.of(node(music, null)));
      given(genreTreeRepository.findById(jazz)).willReturn(Optional.empty());
      given(genreTreeRepository.save(any(GenreTree.class))).willAnswer(call -> call.getArgument(0));
      given(genreRepository.findById(jazz)).willReturn(Optional.of(named(jazz, "jazz")));

      mockMvc.perform(put("/genre_tree/" + jazz).header("Authorization", bearer(admin))
          .contentType(MediaType.APPLICATION_JSON).content("{\"parent_id\":\"" + music + "\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.parent_id").value(music.toString()))
        .andExpect(jsonPath("$.name").value("jazz"));

      ArgumentCaptor<GenreTree> saved = ArgumentCaptor.forClass(GenreTree.class);
      verify(genreTreeRepository).save(saved.capture());
      assertThat(saved.getValue().getId()).isEqualTo(jazz);
      assertThat(saved.getValue().getParent().getId()).isEqualTo(music);
    }

    @Test
    void movesAnExistingNodeToTheRoot() throws Exception {
      given(genreTreeRepository.findById(jazz)).willReturn(Optional.of(node(jazz, node(music, null))));
      given(genreTreeRepository.save(any(GenreTree.class))).willAnswer(call -> call.getArgument(0));

      mockMvc.perform(put("/genre_tree/" + jazz).header("Authorization", bearer(admin))
          .contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.parent_id").doesNotExist());
    }

    @Test
    void refusesANodeAsItsOwnParent() throws Exception {
      mockMvc.perform(put("/genre_tree/" + jazz).header("Authorization", bearer(admin))
          .contentType(MediaType.APPLICATION_JSON).content("{\"parent_id\":\"" + jazz + "\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(content().string("parent_id equals id"));
      verify(genreTreeRepository, never()).save(any());
    }

    @Test
    void answers404ForAnUnknownParent() throws Exception {
      given(genreTreeRepository.findById(music)).willReturn(Optional.empty());
      mockMvc.perform(put("/genre_tree/" + jazz).header("Authorization", bearer(admin))
          .contentType(MediaType.APPLICATION_JSON).content("{\"parent_id\":\"" + music + "\"}"))
        .andExpect(status().isNotFound())
        .andExpect(content().string("parent not found"));
    }

    @Test
    void refusesACycle() throws Exception {
      GenreTree jazzNode = node(jazz, null);
      GenreTree bebopNode = node(bebop, jazzNode); // bebop is under jazz
      given(genreTreeRepository.findById(bebop)).willReturn(Optional.of(bebopNode));
      given(genreTreeRepository.findById(jazz)).willReturn(Optional.of(jazzNode));

      mockMvc.perform(put("/genre_tree/" + jazz).header("Authorization", bearer(admin))
          .contentType(MediaType.APPLICATION_JSON).content("{\"parent_id\":\"" + bebop + "\"}")) // jazz under bebop
        .andExpect(status().isConflict())
        .andExpect(content().string("cycle detected"));
      verify(genreTreeRepository, never()).save(any());
    }

    @Test
    void isForAdminsOnly() throws Exception {
      mockMvc.perform(put("/genre_tree/" + jazz).header("Authorization", bearer(member))
          .contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isForbidden());
      verify(genreTreeRepository, never()).save(any());
    }
  }

  // =========================================================================================================
  @Nested
  class Workloads {
    @Test
    void returnsTheProcessingStatusOfAScore() throws Exception {
      UUID scoreId = UUID.randomUUID();
      Workload workload = new Workload();
      workload.setId(7);
      workload.setKind("pdf");
      workload.setScoreId(scoreId);
      workload.setStatus(Workload.WorkloadStatus.RUNNING);
      workload.setCreatedAt(LocalDateTime.of(2026, 11, 10, 12, 0));
      workload.setMakeFingerings(true);
      given(workloadRepository.findByScoreId(scoreId)).willReturn(Optional.of(workload));

      mockMvc.perform(get("/workload/" + scoreId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(7))
        .andExpect(jsonPath("$.kind").value("pdf"))
        .andExpect(jsonPath("$.status").value("RUNNING"))
        .andExpect(jsonPath("$.scoreId").value(scoreId.toString()))
        .andExpect(jsonPath("$.makeFingerings").value(true));
    }

    @Test
    void answers404WhenTheScoreHasNoWorkload() throws Exception {
      given(workloadRepository.findByScoreId(any())).willReturn(Optional.empty());
      mockMvc.perform(get("/workload/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }
  }
}
