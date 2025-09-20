package org.pianoml.backend.controller;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.api.ArtistApi;
import org.pianoml.backend.mapper.ArtistSearchMapper;
import org.pianoml.backend.model.ArtistSearchResult;
import org.pianoml.backend.model.MbAuthorApiInfo;
import org.pianoml.backend.service.MusicBrainzService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Slf4j
public class ArtistController implements ArtistApi {

  @Autowired
  private MusicBrainzService musicBrainzService;

  @Autowired
  private ArtistSearchMapper artistSearchMapper;

  public ResponseEntity<List<MbAuthorApiInfo>> artistSearchQueryGet(String query) {
    log.info("Searching for artists with query: {}", query);

    try {
      ArtistSearchResult searchResult = musicBrainzService.searchArtistByName(query);

      if (searchResult == null || searchResult.getArtists() == null || searchResult.getArtists().isEmpty()) {
        log.warn("No artists found for query: {}", query);
        return new ResponseEntity<>(HttpStatus.NOT_FOUND);
      }

      // Mapper tous les résultats vers une liste de MbAuthorApiInfo
      List<MbAuthorApiInfo> results = artistSearchMapper.toMbAuthorApiInfoList(searchResult.getArtists());

      log.info("Found {} artists for query: {}", results.size(), query);
      return ResponseEntity.ok(results);

    } catch (Exception e) {
      log.error("Error searching for artists with query: {}", query, e);
      return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

}
