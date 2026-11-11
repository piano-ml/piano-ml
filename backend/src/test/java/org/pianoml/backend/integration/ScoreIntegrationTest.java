package org.pianoml.backend.integration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.entity.YoutubeRank;
import org.pianoml.backend.model.YoutubeVideoApiInfo;
import org.pianoml.backend.service.PackScriptDto;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /score endpoints through ScoreService (and YoutubeService, AuthorService, SlugUtils, the mappers), with the
 * database, S3 and the conversion scripts (PackService) mocked.
 */
class ScoreIntegrationTest extends IntegrationTestBase {

  private User owner;
  private User other;
  private User admin;
  private Author satie;
  private Genre classical;

  @BeforeEach
  void setUp() {
    owner = user("Owner", "USER");
    other = user("Other", "USER");
    admin = user("Admin", "USER,ADMIN");
    satie = new Author();
    satie.setId(UUID.randomUUID());
    satie.setMbid(UUID.randomUUID());
    satie.setName("Erik Satie");
    satie.setSortName("Satie, Erik");
    satie.setSlug("satie-erik");
    satie.setLifeSpanBegin(LocalDate.of(1866, 5, 17));
    satie.setLifeSpanEnd(LocalDate.of(1925, 7, 1));
    classical = new Genre();
    classical.setId(UUID.randomUUID());
    classical.setName("classical");
    classical.setSlug("classical");
  }

  private Score score(User scoreOwner) {
    Score score = new Score();
    score.setId(UUID.randomUUID());
    score.setTitle("Gymnopédie No. 1");
    score.setAuthor(satie);
    score.setGenre(classical);
    score.setOwner(scoreOwner);
    score.setVersion(1);
    score.setStudyTracks("0,1");
    score.setImmutableSlug("satie-erik-gymnopedie-no-1");
    score.setMutableSlug("satie-erik-gymnopedie-no-1");
    score.setPlayCount(42L);
    score.setHasFiles(true);
    return score;
  }

  private static String keyOf(Score score) {
    return "scores/" + score.getOwner().getId() + "/" + score.getId() + "/" + score.getVersion() + ".zip";
  }

  /** A score archive as stored in S3: a zip of named entries. */
  private static byte[] zip(Map<String, String> entries) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
      for (var entry : entries.entrySet()) {
        zip.putNextEntry(new ZipEntry(entry.getKey()));
        zip.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
      }
    }
    return bytes.toByteArray();
  }

  private void s3Has(String key, byte[] zip) {
    given(s3Client.getObject(GetObjectRequest.builder().bucket("pianoml-media").key(key).build()))
      .willAnswer(call -> new ResponseInputStream<>(GetObjectResponse.builder().build(), AbortableInputStream.create(new ByteArrayInputStream(zip))));
  }

  // =========================================================================================================
  @Nested
  class Reading {
    @Test
    void getsAScoreById() throws Exception {
      Score score = score(owner);
      given(scoreRepository.findById(score.getId())).willReturn(Optional.of(score));

      mockMvc.perform(get("/score/" + score.getId() + "/info"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.title").value("Gymnopédie No. 1"))
        .andExpect(jsonPath("$.author").value("Erik Satie"))
        .andExpect(jsonPath("$.author_slug").value("satie-erik"))
        .andExpect(jsonPath("$.genre").value("classical"))
        .andExpect(jsonPath("$.owner_id").value(owner.getId().toString()))
        .andExpect(jsonPath("$.owner").value("Owner"))
        .andExpect(jsonPath("$.study_tracks[0]").value(0))
        .andExpect(jsonPath("$.study_tracks[1]").value(1))
        .andExpect(jsonPath("$.playCount").value(42));
    }

    @Test
    void answers404ForAnUnknownId_and400ForAMalformedOne() throws Exception {
      given(scoreRepository.findById(any())).willReturn(Optional.empty());
      mockMvc.perform(get("/score/" + UUID.randomUUID() + "/info")).andExpect(status().isNotFound());
      mockMvc.perform(get("/score/not-a-uuid/info")).andExpect(status().isBadRequest());
    }

    @Test
    void getsAScoreBySlug() throws Exception {
      given(scoreRepository.findByImmutableSlug("satie-erik-gymnopedie-no-1")).willReturn(Optional.of(score(owner)));
      mockMvc.perform(get("/score/satie-erik-gymnopedie-no-1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.immutableSlug").value("satie-erik-gymnopedie-no-1"));
      mockMvc.perform(get("/score/unknown-slug")).andExpect(status().isNotFound());
    }

    @Test
    void searchPassesEveryCriterionToTheRepository_withTheLoggedInUser() throws Exception {
      given(scoreRepository.findWithSomeCriterias(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
        .willReturn(List.of(score(owner)));

      mockMvc.perform(get("/score/search").header("Authorization", bearer(owner))
          .param("keyword", "gymno").param("genre_slug", "classical").param("gradeStart", "1").param("gradeEnd", "4")
          .param("fullKey", "a minor").param("offset", "20").param("limit", "10").param("tracks", "1", "2"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].title").value("Gymnopédie No. 1"));

      verify(scoreRepository).findWithSomeCriterias(eq("gymno"), isNull(), isNull(), isNull(), isNull(), eq("classical"), isNull(),
        eq("1"), eq("4"), isNull(), eq("a minor"), isNull(), eq(20), eq(10), eq(owner), eq(List.of(1, 2)), isNull());
    }

    @Test
    void searchWorksAnonymously() throws Exception {
      given(scoreRepository.findWithSomeCriterias(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
        .willReturn(List.of());
      mockMvc.perform(get("/score/search").param("keyword", "x")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
      verify(scoreRepository).findWithSomeCriterias(eq("x"), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), any(), any());
    }

    @Test
    void listsTheKeysInUse() throws Exception {
      given(scoreRepository.findDistinctFullKeys()).willReturn(List.of("C major", "a minor"));
      mockMvc.perform(get("/score/getFullKey")).andExpect(jsonPath("$[1]").value("a minor"));
    }

    @Test
    void countsPublicDomainAndCopyrightedScores() throws Exception {
      given(scoreRepository.countPublicAndCopyrighted()).willReturn(new Long[] {12706L, 340L});
      mockMvc.perform(get("/score/stats"))
        .andExpect(jsonPath("$['public-domain']").value(12706))
        .andExpect(jsonPath("$.copyrighted").value(340));
    }

    @Test
    void browsesAuthorsWithTheirScoreCount_offsetIgnoredWithoutLimit() throws Exception {
      OffsetDateTime last = OffsetDateTime.parse("2026-11-01T10:00:00Z");
      given(scoreRepository.countScoresGroupedByAuthor(any(), any(), any(), any(), any(), any(), any(), any()))
        .willReturn(List.<Object[]>of(new Object[] {satie, 7L, last}));

      mockMvc.perform(get("/score/author/browse").param("offset", "30").param("fullKey", "C major"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].author.name").value("Erik Satie"))
        .andExpect(jsonPath("$[0].count").value(7));
      verify(scoreRepository).countScoresGroupedByAuthor(isNull(), isNull(), isNull(), isNull(), eq("C major"), isNull(), isNull(), isNull());

      mockMvc.perform(get("/score/author/browse").param("offset", "-5").param("limit", "10"));
      verify(scoreRepository).countScoresGroupedByAuthor(isNull(), eq(0), eq(10), isNull(), isNull(), isNull(), isNull(), isNull());
    }

    @Test
    void browsesGenres_includingScoresWithoutGenre() throws Exception {
      given(scoreRepository.countScoresGroupedByGenre(any(), any(), any(), any(), any(), any(), any(), any(), any()))
        .willReturn(List.<Object[]>of(new Object[] {classical, 3L, null}, new Object[] {null, 1L, null}));

      mockMvc.perform(get("/score/genre/browse").param("limit", "5"))
        .andExpect(jsonPath("$[0].genre.name").value("classical"))
        .andExpect(jsonPath("$[0].count").value(3))
        .andExpect(jsonPath("$[1].genre").doesNotExist())
        .andExpect(jsonPath("$[1].count").value(1));
    }
  }

  // =========================================================================================================
  @Nested
  class Creating {
    private String body(Map<String, Object> fields) {
      var all = new java.util.HashMap<String, Object>(Map.of("title", "Gymnopédie No. 1", "author_id", satie.getMbid().toString()));
      all.putAll(fields);
      return json(all);
    }

    private Score saved() {
      ArgumentCaptor<Score> saved = ArgumentCaptor.forClass(Score.class);
      verify(scoreRepository).save(saved.capture());
      return saved.getValue();
    }

    @BeforeEach
    void knownAuthorAndGenre() {
      given(authorRepository.findByMbid(satie.getMbid())).willReturn(Optional.of(satie));
      given(genreRepository.findById(classical.getId())).willReturn(Optional.of(classical));
      given(scoreRepository.save(any(Score.class))).willAnswer(call -> {
        Score score = call.getArgument(0);
        score.setId(UUID.randomUUID());
        return score;
      });
    }

    @Test
    void createsTheScoreForItsOwner_withASlugAndDefaults() throws Exception {
      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(body(Map.of("genre_id", classical.getId().toString(), "fullKey", "D major", "tonic", "D", "mode", "major"))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.immutableSlug").value("satie-erik-gymnopedie-no-1"))
        .andExpect(jsonPath("$.owner_id").value(owner.getId().toString()));

      Score score = saved();
      assertThat(score.getOwner()).isEqualTo(owner);
      assertThat(score.getAuthor()).isEqualTo(satie);
      assertThat(score.getGenre()).isEqualTo(classical);
      assertThat(score.getVersion()).isEqualTo(1);
      assertThat(score.getMutableSlug()).isEqualTo("satie-erik-gymnopedie-no-1");
      assertThat(score.getPlayCount()).isZero();
      assertThat(score.getExercise()).isFalse();
      assertThat(score.getHasFiles()).isFalse();
      assertThat(score.getPublicDomain()).isTrue(); // Satie died in 1925
      assertThat(List.of(score.getFullKey(), score.getTonic(), score.getMode())).containsExactly("D major", "D", "major");
    }

    @Test
    void numbersAnotherVersionOfTheSameWork() throws Exception {
      UUID work = UUID.randomUUID();
      given(scoreRepository.countScoreByMbidAndOwner(work, owner)).willReturn(2);

      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(body(Map.of("mbid", work.toString()))))
        .andExpect(status().isCreated());

      assertThat(saved().getVersion()).isEqualTo(3);
    }

    @Test
    void suffixesTheSlugWhenItIsTaken() throws Exception {
      Score taken = score(other);
      given(scoreRepository.findByImmutableSlugStartingWith("satie-erik-gymnopedie-no-1")).willReturn(List.of(taken));

      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.immutableSlug").value("satie-erik-gymnopedie-no-1-1"));
      assertThat(saved().getVersion()).isEqualTo(2);
    }

    @Test
    void marksALivingComposerAsCopyrighted() throws Exception {
      satie.setLifeSpanEnd(null); // born, not dead
      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isCreated());
      assertThat(saved().getPublicDomain()).isFalse();
    }

    @Test
    void marksAComposerDeadForLessThan70YearsAsCopyrighted() throws Exception {
      satie.setLifeSpanEnd(LocalDate.now().minusYears(30));
      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isCreated());
      assertThat(saved().getPublicDomain()).isFalse();
    }

    @Test
    void createsTheAuthorFromMusicBrainzWhenUnknown() throws Exception {
      UUID mbid = UUID.randomUUID();
      given(authorRepository.findByMbid(mbid)).willReturn(Optional.empty());
      given(restTemplate.getForObject(anyString(), eq(String.class)))
        .willReturn("{\"id\":\"" + mbid + "\",\"name\":\"Mildred J. Hill\",\"sort-name\":\"Hill, Mildred J.\"}");

      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(body(Map.of("author_id", mbid.toString(), "title", "Happy Birthday to You"))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.immutableSlug").value("hill-mildred-j-happy-birthday-to-you"));

      verify(authorRepository).save(any(Author.class));
      assertThat(saved().getPublicDomain()).isTrue(); // no known dates
    }

    @Test
    void refusesAScoreAlreadyCreatedByTheUser() throws Exception {
      given(scoreRepository.save(any(Score.class))).willThrow(new DataIntegrityViolationException("duplicate key"));
      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.message").value("You have already created this score, please consider edit it in account/scores page."));
    }

    @Test
    void requiresATitleAndAnAuthor() throws Exception {
      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(json(Map.of("title", " ", "author_id", satie.getMbid().toString()))))
        .andExpect(status().isBadRequest());
      mockMvc.perform(post("/score").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(json(Map.of("title", "Untitled"))))
        .andExpect(status().isBadRequest());
      verify(scoreRepository, never()).save(any());
    }

    @Test
    void needsALogin() throws Exception {
      mockMvc.perform(post("/score").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isUnauthorized());
    }
  }

  // =========================================================================================================
  @Nested
  class Updating {
    private Score score;

    @BeforeEach
    void stored() {
      score = score(owner);
      given(scoreRepository.findById(score.getId())).willReturn(Optional.of(score));
      given(scoreRepository.save(any(Score.class))).willAnswer(call -> call.getArgument(0));
    }

    private String body(Map<String, Object> fields) {
      var all = new java.util.HashMap<String, Object>(Map.of("title", "Gymnopédie No. 1 (revised)"));
      all.putAll(fields);
      return json(all);
    }

    @Test
    void theOwnerEditsTheScore() throws Exception {
      Genre jazz = new Genre();
      jazz.setId(UUID.randomUUID());
      jazz.setName("jazz");
      given(genreRepository.findById(jazz.getId())).willReturn(Optional.of(jazz));

      mockMvc.perform(put("/score/" + score.getId() + "/info").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(body(Map.of("genre_id", jazz.getId().toString(), "tempo", 72, "grade", 3.5, "study_tracks", List.of(1, 0),
            "description", "Slow and painful", "publicDomain", false, "fullKey", "D major"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.title").value("Gymnopédie No. 1 (revised)"))
        .andExpect(jsonPath("$.genre").value("jazz"));

      ArgumentCaptor<Score> saved = ArgumentCaptor.forClass(Score.class);
      verify(scoreRepository).save(saved.capture());
      Score edited = saved.getValue();
      assertThat(edited.getTempo()).isEqualTo(72);
      assertThat(edited.getGrade()).isEqualTo(3.5f);
      assertThat(edited.getStudyTracks()).isEqualTo("1,0");
      assertThat(edited.getDescription()).isEqualTo("Slow and painful");
      assertThat(edited.getPublicDomain()).isFalse();
      assertThat(edited.getFullKey()).isEqualTo("D major");
      assertThat(edited.getAuthor()).isEqualTo(satie);
    }

    @Test
    void aMalformedGenreIdRemovesTheGenre() throws Exception {
      mockMvc.perform(put("/score/" + score.getId() + "/info").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(body(Map.of("genre_id", "none"))))
        .andExpect(status().isOk());
      assertThat(score.getGenre()).isNull();
    }

    @Test
    void changingTheAuthorResolvesItByMusicBrainzId() throws Exception {
      Author ravel = new Author();
      ravel.setId(UUID.randomUUID());
      ravel.setMbid(UUID.randomUUID());
      ravel.setName("Maurice Ravel");
      given(authorRepository.findByMbid(ravel.getMbid())).willReturn(Optional.of(ravel));

      mockMvc.perform(put("/score/" + score.getId() + "/info").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON)
          .content(body(Map.of("author_id", ravel.getMbid().toString()))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.author").value("Maurice Ravel"));
    }

    @Test
    void anAdminEditsAnyScore() throws Exception {
      mockMvc.perform(put("/score/" + score.getId() + "/info").header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isOk());
      verify(scoreRepository).save(score);
    }

    @Test
    void anotherUserCannot() throws Exception {
      mockMvc.perform(put("/score/" + score.getId() + "/info").header("Authorization", bearer(other)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isForbidden());
      verify(scoreRepository, never()).save(any());
    }

    @Test
    void answers404ForAnUnknownScore() throws Exception {
      mockMvc.perform(put("/score/" + UUID.randomUUID() + "/info").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of())))
        .andExpect(status().isNotFound());
    }
  }

  // =========================================================================================================
  @Nested
  class Deleting {
    private Score score;

    @BeforeEach
    void stored() {
      score = score(owner);
      given(scoreRepository.findById(score.getId())).willReturn(Optional.of(score));
    }

    @Test
    void theOwnerDeletesTheScore_itsPlayCountsAndItsFiles() throws Exception {
      mockMvc.perform(delete("/score/" + score.getId() + "/info").header("Authorization", bearer(owner)))
        .andExpect(status().isNoContent());

      var order = org.mockito.Mockito.inOrder(userPlayCountRepository, s3Client, scoreRepository);
      order.verify(userPlayCountRepository).deleteByScoreId(score.getId());
      order.verify(s3Client).deleteObject(DeleteObjectRequest.builder().bucket("pianoml-media").key(keyOf(score)).build());
      order.verify(scoreRepository).delete(score);
    }

    @Test
    void doesNotTouchS3ForAScoreWithoutFiles() throws Exception {
      score.setHasFiles(false);
      mockMvc.perform(delete("/score/" + score.getId() + "/info").header("Authorization", bearer(owner))).andExpect(status().isNoContent());
      verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
      verify(scoreRepository).delete(score);
    }

    @Test
    void stillDeletesTheScoreWhenS3Fails() throws Exception {
      willThrow(S3Exception.builder().message("boom").build()).given(s3Client).deleteObject(any(DeleteObjectRequest.class));
      mockMvc.perform(delete("/score/" + score.getId() + "/info").header("Authorization", bearer(owner))).andExpect(status().isNoContent());
      verify(scoreRepository).delete(score);
    }

    @Test
    void anAdminDeletesAnyScore() throws Exception {
      mockMvc.perform(delete("/score/" + score.getId() + "/info").header("Authorization", bearer(admin))).andExpect(status().isNoContent());
      verify(scoreRepository).delete(score);
    }

    @Test
    void anotherUserCannot() throws Exception {
      mockMvc.perform(delete("/score/" + score.getId() + "/info").header("Authorization", bearer(other))).andExpect(status().isForbidden());
      verify(userPlayCountRepository, never()).deleteByScoreId(any());
      verify(scoreRepository, never()).delete(any());
    }

    @Test
    void answers404ForAnUnknownScore() throws Exception {
      mockMvc.perform(delete("/score/" + UUID.randomUUID() + "/info").header("Authorization", bearer(owner))).andExpect(status().isNotFound());
    }

    @Test
    void needsALogin() throws Exception {
      mockMvc.perform(delete("/score/" + score.getId() + "/info").with(csrf())).andExpect(status().isUnauthorized());
    }
  }

  // =========================================================================================================
  @Nested
  class PlayStats {
    @Test
    void countsAnAnonymousPlay() throws Exception {
      UUID id = UUID.randomUUID();
      mockMvc.perform(post("/score/play/stats").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"" + id + "\"}"))
        .andExpect(status().isOk());
      verify(scoreRepository).incrementPlayCount(id);
      verify(userPlayCountRepository, never()).incrementPlayCount(any(), any());
    }

    @Test
    void alsoCountsItForTheLoggedInUser() throws Exception {
      UUID id = UUID.randomUUID();
      mockMvc.perform(post("/score/play/stats").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"" + id + "\"}"))
        .andExpect(status().isOk());
      verify(scoreRepository).incrementPlayCount(id);
      verify(userPlayCountRepository).incrementPlayCount(owner.getId(), id);
    }

    @Test
    void ignoresAMalformedId() throws Exception {
      mockMvc.perform(post("/score/play/stats").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"nope\"}"))
        .andExpect(status().isOk());
      verify(scoreRepository, never()).incrementPlayCount(any());
    }
  }

  // =========================================================================================================
  @Nested
  class Videos {
    private Score score;

    @BeforeEach
    void stored() {
      score = score(owner);
      given(scoreRepository.findById(score.getId())).willReturn(Optional.of(score));
    }

    private YoutubeRank cached(String videoId) {
      YoutubeRank rank = new YoutubeRank(score.getId(), videoId);
      YoutubeVideoApiInfo info = new YoutubeVideoApiInfo();
      info.setVideoId(videoId);
      info.setTitle("Gymnopédie tutorial");
      rank.setYoutubeVideoApiInfo(info);
      return rank;
    }

    @Test
    void listsTheCachedVideosOfAScore() throws Exception {
      given(youtubeRankRepository.findByScoreIdAndYoutubeVideoApiInfoIsNotNull(score.getId())).willReturn(List.of(cached("abc"), cached("def")));

      mockMvc.perform(get("/score/" + score.getId() + "/video"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].videoId").value("abc"));
    }

    @Test
    void hasNoVideosWithoutCacheNorYoutubeKey() throws Exception {
      given(youtubeRankRepository.findByScoreIdAndYoutubeVideoApiInfoIsNotNull(score.getId())).willReturn(List.of());
      mockMvc.perform(get("/score/" + score.getId() + "/video")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
      verify(youtubeRankRepository, never()).save(any());
    }

    @Test
    void answers404ForAnUnknownScore_and400ForAMalformedId() throws Exception {
      mockMvc.perform(get("/score/" + UUID.randomUUID() + "/video")).andExpect(status().isNotFound());
      mockMvc.perform(get("/score/nope/video")).andExpect(status().isBadRequest());
    }

    @Test
    void anUpvoteCreatesTheRankingRowWhenMissing() throws Exception {
      given(youtubeRankRepository.findByScoreIdAndVideoId(score.getId(), "abc")).willReturn(Optional.empty());
      given(youtubeRankRepository.save(any(YoutubeRank.class))).willAnswer(call -> call.getArgument(0));

      mockMvc.perform(post("/score/" + score.getId() + "/video/abc/upvote").header("Authorization", bearer(owner)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.title").value("Gymnopédie No. 1"));

      ArgumentCaptor<YoutubeRank> created = ArgumentCaptor.forClass(YoutubeRank.class);
      verify(youtubeRankRepository).save(created.capture());
      assertThat(List.of(created.getValue().getScoreId(), created.getValue().getVideoId())).containsExactly(score.getId(), "abc");
      verify(youtubeRankRepository).incrementRank(score.getId(), "abc");
    }

    @Test
    void eachActionUpdatesItsCounter_onTheExistingRow() throws Exception {
      given(youtubeRankRepository.findByScoreIdAndVideoId(score.getId(), "abc")).willReturn(Optional.of(cached("abc")));
      for (String action : List.of("downvote", "view", "report")) {
        mockMvc.perform(post("/score/" + score.getId() + "/video/abc/" + action).header("Authorization", bearer(owner))).andExpect(status().isOk());
      }
      verify(youtubeRankRepository).decrementRank(score.getId(), "abc");
      verify(youtubeRankRepository).incrementViews(score.getId(), "abc");
      verify(youtubeRankRepository).incrementReports(score.getId(), "abc");
      verify(youtubeRankRepository, never()).save(any());
    }

    @Test
    void refusesAnUnknownAction_withoutCreatingARow() throws Exception {
      given(youtubeRankRepository.findByScoreIdAndVideoId(score.getId(), "abc")).willReturn(Optional.empty());
      mockMvc.perform(post("/score/" + score.getId() + "/video/abc/like").header("Authorization", bearer(owner)))
        .andExpect(status().isBadRequest());
      verify(youtubeRankRepository, never()).save(any());
    }

    @Test
    void votingAnswers404ForAnUnknownScore_and400ForAMalformedId() throws Exception {
      mockMvc.perform(post("/score/" + UUID.randomUUID() + "/video/abc/upvote").header("Authorization", bearer(owner))).andExpect(status().isNotFound());
      mockMvc.perform(post("/score/nope/video/abc/upvote").header("Authorization", bearer(owner))).andExpect(status().isBadRequest());
    }
  }

  // =========================================================================================================
  @Nested
  class Uploading {
    private Score score;
    private final byte[] file = "MThd fake midi".getBytes(StandardCharsets.UTF_8);

    @BeforeEach
    void stored() {
      score = score(owner);
      score.setHasFiles(false);
      given(scoreRepository.findScoreByIdAndOwnerAndVersion(score.getId(), owner, 1)).willReturn(Optional.of(score));
    }

    private org.springframework.test.web.servlet.ResultActions upload(String type, String query) throws Exception {
      return mockMvc.perform(post("/score/" + score.getId() + "/" + type + "/1/0" + query).header("Authorization", bearer(owner))
        .contentType(MediaType.APPLICATION_OCTET_STREAM).content(file));
    }

    private PackScriptDto packed(java.util.function.Consumer<ArgumentCaptor<PackScriptDto>> verifyCall) {
      ArgumentCaptor<PackScriptDto> dto = ArgumentCaptor.forClass(PackScriptDto.class);
      verifyCall.accept(dto);
      return dto.getValue();
    }

    @Test
    void packsAMidiFile_storesTheArchive_andReadsItsMetadataIntoTheScore() throws Exception {
      Path archive = Files.createTempFile("pack", ".zip");
      Files.write(archive, zip(Map.of("x.mid", "midi")));
      given(packService.packMidi(any(PackScriptDto.class))).willReturn(archive.toString());
      s3Has(keyOf(score), zip(Map.of("metadata.json",
        "{\"tracks_count\":2,\"duration_seconds\":184.6,\"measures_count\":39,\"tempo\":72,\"has_lyrics\":false,"
          + "\"analysis\":{\"tonic\":\"D\",\"mode\":\"major\",\"full_key\":\"D major\"},\"grade\":2.5,"
          + "\"harmony\":[{\"offset\":0,\"chord\":\"Gmaj7\"}]}")));

      upload("midi", "?makeFingering=false").andExpect(status().isOk());

      PackScriptDto dto = packed(c -> {
        try { verify(packService).packMidi(c.capture()); } catch (IOException e) { throw new RuntimeException(e); }
      });
      assertThat(List.of(dto.getType(), dto.getTitle(), dto.getComposer(), dto.getTrackRight(), dto.getTrackLeft()))
        .containsExactly("midi", "Gymnopédie No. 1", "Erik Satie", "0", "1");
      assertThat(dto.getMakeFingerings()).isFalse();
      verify(s3Client).putObject(eq(PutObjectRequest.builder().bucket("pianoml-media").key(keyOf(score)).build()), any(RequestBody.class));

      assertThat(score.getHasFiles()).isTrue();
      assertThat(score.getUploadedAt()).isNotNull();
      assertThat(List.of(score.getTracksCount(), score.getDuration(), score.getMeasuresCount(), score.getTempo())).containsExactly(2, 185, 39, 72);
      assertThat(List.of(score.getTonic(), score.getMode(), score.getFullKey())).containsExactly("D", "major", "D major");
      assertThat(score.getGrade()).isEqualTo(2.5f);
      assertThat(score.getHarmony()).contains("Gmaj7");
      verify(scoreRepository, org.mockito.Mockito.atLeastOnce()).save(score);
      assertThat(archive).doesNotExist(); // the local archive is cleaned up
    }

    @Test
    void fingeringIsOnByDefault() throws Exception {
      Path archive = Files.createTempFile("pack", ".zip");
      given(packService.packMusicXml(any(PackScriptDto.class))).willReturn(archive.toString());
      upload("musicxml", "").andExpect(status().isOk());
      PackScriptDto dto = packed(c -> {
        try { verify(packService).packMusicXml(c.capture()); } catch (IOException e) { throw new RuntimeException(e); }
      });
      assertThat(dto.getMakeFingerings()).isTrue();
    }

    @Test
    void compressedMusicXmlUsesTheMusicXmlScript() throws Exception {
      given(packService.packMusicXml(any(PackScriptDto.class))).willReturn(Files.createTempFile("pack", ".zip").toString());
      upload("mxl", "").andExpect(status().isOk());
      verify(packService).packMusicXml(any(PackScriptDto.class));
    }

    @Test
    void queuesPdfsAndImagesForBackgroundRecognition() throws Exception {
      upload("pdf", "").andExpect(status().isOk());
      verify(packService).packPDFWorkload(any(PackScriptDto.class), eq(keyOf(score)));
      upload("image", "").andExpect(status().isOk());
      verify(packService).packImageWorkload(any(PackScriptDto.class), eq(keyOf(score)));
      verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    void refusesAnUnsupportedType() throws Exception {
      upload("wav", "").andExpect(status().isInternalServerError());
      verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    void answers404WhenTheUserHasNoSuchScoreVersion() throws Exception {
      mockMvc.perform(post("/score/" + score.getId() + "/midi/2/0").header("Authorization", bearer(owner))
          .contentType(MediaType.APPLICATION_OCTET_STREAM).content(file))
        .andExpect(status().isNotFound());
      verify(packService, never()).packMidi(any());
    }

    @Test
    void needsALogin() throws Exception {
      mockMvc.perform(post("/score/" + score.getId() + "/midi/1/0").with(csrf()).contentType(MediaType.APPLICATION_OCTET_STREAM).content(file))
        .andExpect(status().isUnauthorized());
    }
  }

  // =========================================================================================================
  @Nested
  class Downloading {
    private Score score;

    @BeforeEach
    void stored() throws IOException {
      score = score(owner);
      given(userRepository.findById(owner.getId())).willReturn(Optional.of(owner));
      given(scoreRepository.findScoreByIdAndOwnerAndVersion(score.getId(), owner, 1)).willReturn(Optional.of(score));
      s3Has(keyOf(score), zip(Map.of("score.musicxml", "<score-partwise/>", "score.midi", "MThd", "score.pdf", "%PDF", "metadata.json", "{}")));
    }

    private String url(String type) {
      return "/score/" + owner.getId() + "/" + score.getId() + "/" + type + "/1/0";
    }

    @Test
    void sendsEachFileOfTheArchiveWithItsMediaType() throws Exception {
      mockMvc.perform(get(url("musicxml"))).andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "application/xml")).andExpect(content().string("<score-partwise/>"));
      mockMvc.perform(get(url("midi"))).andExpect(header().string("Content-Type", "audio/midi")).andExpect(content().string("MThd"));
      mockMvc.perform(get(url("pdf"))).andExpect(header().string("Content-Type", "application/pdf"));
      mockMvc.perform(get(url("metadata.json"))).andExpect(header().string("Content-Type", "application/octet-stream"));
    }

    @Test
    void answers404WhenTheArchiveHasNoSuchFile() throws Exception {
      mockMvc.perform(get(url("mxl"))).andExpect(status().isNotFound());
    }

    @Test
    void answers404WhenTheArchiveIsMissingFromS3() throws Exception {
      given(s3Client.getObject(any(GetObjectRequest.class))).willThrow(S3Exception.builder().statusCode(404).message("NoSuchKey").build());
      mockMvc.perform(get(url("musicxml"))).andExpect(status().isNotFound());
    }

    @Test
    void answers404ForAnUnknownScoreOrOwner() throws Exception {
      mockMvc.perform(get("/score/" + owner.getId() + "/" + UUID.randomUUID() + "/midi/1/0")).andExpect(status().isNotFound());
      mockMvc.perform(get("/score/" + UUID.randomUUID() + "/" + score.getId() + "/midi/1/0")).andExpect(status().isNotFound());
    }
  }
}
