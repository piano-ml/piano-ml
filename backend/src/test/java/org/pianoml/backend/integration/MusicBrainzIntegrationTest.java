package org.pianoml.backend.integration;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.AllWorksApiInfo;
import org.pianoml.backend.model.AllWorksApiInfoWorksInner;
import org.pianoml.backend.model.AllWorksApiInfoWorksInnerRelationsInner;
import org.pianoml.backend.model.AllWorksApiInfoWorksInnerRelationsInnerArtist;
import org.pianoml.backend.model.ArtistSearchResult;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpServerErrorException;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /artist/search and /work/search through MusicBrainzService, with the MusicBrainz HTTP API (RestTemplate) mocked. */
class MusicBrainzIntegrationTest extends IntegrationTestBase {

  /** The URI sent to MusicBrainz for a search returning `type`. */
  private <T> URI sentUri(Class<T> type) {
    org.mockito.ArgumentCaptor<URI> uri = org.mockito.ArgumentCaptor.forClass(URI.class);
    verify(restTemplate).getForObject(uri.capture(), eq(type));
    return uri.getValue();
  }

  /** Its query parameters, decoded. */
  private static java.util.Map<String, String> params(URI uri) {
    var params = org.springframework.web.util.UriComponentsBuilder.fromUri(uri).build().getQueryParams();
    var decoded = new java.util.TreeMap<String, String>();
    params.forEach((k, v) -> decoded.put(k, java.net.URLDecoder.decode(v.get(0), java.nio.charset.StandardCharsets.UTF_8)));
    return decoded;
  }

  @Nested
  class ArtistSearch {
    private ArtistSearchResult.MbArtistResult artist(String id, String name, String begin) {
      ArtistSearchResult.MbArtistResult artist = new ArtistSearchResult.MbArtistResult();
      artist.setId(id);
      artist.setName(name);
      artist.setSortName(name.replace(' ', ','));
      artist.setCountry("US");
      artist.setType("Person");
      artist.setDisambiguation("composer");
      ArtistSearchResult.MbArtistResult.LifeSpan lifeSpan = new ArtistSearchResult.MbArtistResult.LifeSpan();
      lifeSpan.setBegin(begin);
      artist.setLifeSpan(lifeSpan);
      return artist;
    }

    private ArtistSearchResult result(ArtistSearchResult.MbArtistResult... artists) {
      ArtistSearchResult result = new ArtistSearchResult();
      result.setCount(artists.length);
      result.setArtists(new ArrayList<>(List.of(artists)));
      return result;
    }

    @Test
    void queriesMusicBrainzWithAnEncodedNameAndMapsTheArtists() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(ArtistSearchResult.class)))
        .willReturn(result(artist("a1", "Mildred J. Hill", "1859-06-27"), artist("a2", "Mildred Hill", "1859")));

      mockMvc.perform(get("/artist/search/Mildred J. Hill"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].id").value("a1"))
        .andExpect(jsonPath("$[0].name").value("Mildred J. Hill"))
        .andExpect(jsonPath("$[0].country").value("US"))
        .andExpect(jsonPath("$[0].disambiguation").value("composer"))
        .andExpect(jsonPath("$[0]['life-span'].begin").value("1859-06-27"))
        .andExpect(jsonPath("$[1]['life-span'].begin").value("1859-01-01")); // year only: flexible parsing

      URI sent = sentUri(ArtistSearchResult.class);
      assertThat(sent.getHost()).isEqualTo("musicbrainz.org");
      assertThat(sent.getPath()).isEqualTo("/ws/2/artist");
      assertThat(params(sent)).isEqualTo(java.util.Map.of("query", "Mildred J. Hill", "fmt", "json", "offset", "0"));
    }

    @Test
    void sendsAccentedNamesEncodedOnce() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(ArtistSearchResult.class))).willReturn(result(artist("a3", "Antonín Dvořák", "1841")));

      mockMvc.perform(get("/artist/search/Dvořák")).andExpect(status().isOk());

      URI sent = sentUri(ArtistSearchResult.class);
      assertThat(sent.getRawQuery()).contains("query=Dvo%C5%99%C3%A1k").doesNotContain("%25");
      assertThat(params(sent).get("query")).isEqualTo("Dvořák");
    }

    @Test
    void answers404WhenNoArtistMatches() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(ArtistSearchResult.class))).willReturn(result());
      mockMvc.perform(get("/artist/search/nobody")).andExpect(status().isNotFound());
    }

    @Test
    void answers404WhenMusicBrainzSendsNothing() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(ArtistSearchResult.class))).willReturn(null);
      mockMvc.perform(get("/artist/search/nobody")).andExpect(status().isNotFound());
    }

    @Test
    void answers500WhenMusicBrainzFails() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(ArtistSearchResult.class)))
        .willThrow(new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE));
      mockMvc.perform(get("/artist/search/anyone")).andExpect(status().isInternalServerError());
    }
  }

  @Nested
  class WorkSearch {
    private AllWorksApiInfoWorksInnerRelationsInner relation(String artistName) {
      AllWorksApiInfoWorksInnerRelationsInner relation = new AllWorksApiInfoWorksInnerRelationsInner();
      if (artistName != null) {
        AllWorksApiInfoWorksInnerRelationsInnerArtist artist = new AllWorksApiInfoWorksInnerRelationsInnerArtist();
        artist.setId(artistName.toLowerCase().replace(' ', '-'));
        artist.setName(artistName);
        relation.setArtist(artist);
      }
      return relation;
    }

    private AllWorksApiInfo works(AllWorksApiInfoWorksInner... works) {
      AllWorksApiInfo all = new AllWorksApiInfo();
      all.setWorks(new ArrayList<>(List.of(works)));
      return all;
    }

    private AllWorksApiInfoWorksInner work(String title, AllWorksApiInfoWorksInnerRelationsInner... relations) {
      AllWorksApiInfoWorksInner work = new AllWorksApiInfoWorksInner();
      work.setId(title.toLowerCase());
      work.setTitle(title);
      work.setRelations(new ArrayList<>(List.of(relations)));
      return work;
    }

    @Test
    void keepsOneRelationPerArtist_inOrder_andDropsRelationsWithoutArtist() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(AllWorksApiInfo.class))).willReturn(works(
        work("Imagine", relation("John Lennon"), relation(null), relation("Yoko Ono"), relation("John Lennon"))));

      mockMvc.perform(get("/work/search/imagine"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.works[0].title").value("Imagine"))
        .andExpect(jsonPath("$.works[0].relations", hasSize(2)))
        .andExpect(jsonPath("$.works[0].relations[0].artist.name").value("John Lennon"))
        .andExpect(jsonPath("$.works[0].relations[1].artist.name").value("Yoko Ono"));
    }

    @Test
    void searchesTheIndexedWorksWithALimitOf25() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(AllWorksApiInfo.class))).willReturn(works());
      mockMvc.perform(get("/work/search/redemption")).andExpect(status().isOk()).andExpect(jsonPath("$.works", hasSize(0)));
      URI sent = sentUri(AllWorksApiInfo.class);
      assertThat(sent.getPath()).isEqualTo("/ws/2/work");
      assertThat(params(sent)).isEqualTo(java.util.Map.of("query", "redemption", "fmt", "json", "limit", "25", "method", "indexed"));
    }

    @Test
    void encodesTheQuery_soAnAmpersandCannotAddParameters() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(AllWorksApiInfo.class))).willReturn(works());
      mockMvc.perform(get("/work/search/rock & roll")).andExpect(status().isOk());
      URI sent = sentUri(AllWorksApiInfo.class);
      assertThat(params(sent).get("query")).isEqualTo("rock & roll");
      assertThat(params(sent)).containsEntry("limit", "25").hasSize(4); // the "&" did not add a parameter
    }

    @Test
    void answers500WhenMusicBrainzFails() throws Exception {
      given(restTemplate.getForObject(any(URI.class), eq(AllWorksApiInfo.class)))
        .willThrow(new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE));
      mockMvc.perform(get("/work/search/anything")).andExpect(status().isInternalServerError());
    }
  }
}
