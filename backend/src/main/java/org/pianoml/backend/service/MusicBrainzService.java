package org.pianoml.backend.service;

import java.net.URI;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.web.util.UriComponentsBuilder;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.mapper.MbAuthorApiInfoMapper;
import org.pianoml.backend.model.AllWorksApiInfo;
import org.pianoml.backend.model.ArtistSearchResult;
import org.pianoml.backend.model.MbAuthorApiInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

@Slf4j
@Service
public class MusicBrainzService {

  @Autowired
  private RestTemplate restTemplate;

  @Autowired
  private MbAuthorApiInfoMapper mbAuthorApiInfoMapper;

  public AllWorksApiInfo searchWorks(String query) {
    URI url = searchUri("work", query, Map.of("limit", "25", "method", "indexed"));
    return restTemplate.getForObject(url, AllWorksApiInfo.class);
  }

  public ArtistSearchResult searchArtistByName(String query) {
    URI url = searchUri("artist", query, Map.of("offset", "0"));
    log.info("Searching artists in MusicBrainz: {}", url);
    ArtistSearchResult result = restTemplate.getForObject(url, ArtistSearchResult.class);
    log.info("Found {} artists for query: {}", result != null ? result.getCount() : 0, query);
    return result;
  }

  /**
   * A MusicBrainz search URI with every parameter encoded exactly once. Passed to RestTemplate as a URI, which
   * it does not encode again: a String URL is re-encoded, so a query pre-encoded with URLEncoder reached
   * MusicBrainz double-encoded ("Dvořák" became "Dvo%25C5%2599...": no result), and an unencoded one let an
   * "&" in the query start a new parameter.
   */
  static URI searchUri(String entity, String query, Map<String, String> params) {
    UriComponentsBuilder builder = UriComponentsBuilder.fromUriString("https://musicbrainz.org/ws/2/" + entity)
      .queryParam("query", query)
      .queryParam("fmt", "json");
    new TreeMap<>(params).forEach(builder::queryParam);
    return builder.encode().build().toUri();
  }

  public Author getAuthor(UUID mbid) {
    String url = "https://musicbrainz.org/ws/2/artist/" + mbid.toString() + "?fmt=json";
    log.info("Fetching artist info from MusicBrainz: {}", url);
    try {
      // Fetch raw JSON to avoid relying on the global RestTemplate ObjectMapper
      String json = restTemplate.getForObject(url, String.class);
      if (json == null) {
        log.warn("MusicBrainz returned null body for artist {}", mbid);
        return null;
      }

      ObjectMapper mapper = new ObjectMapper();
      // Ignore unknown properties coming from MusicBrainz (e.g. end-area) so mapping is tolerant
      mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

      // Read tree to extract original begin/end text, then remove life-span to avoid Jackson parsing
      JsonNode root = mapper.readTree(json);
      String originalBegin = null;
      String originalEnd = null;
      if (root != null && root.has("life-span") && root.get("life-span").isObject()) {
        ObjectNode lifeSpan = (ObjectNode) root.get("life-span");
        JsonNode beginNode = lifeSpan.get("begin");
        JsonNode endNode = lifeSpan.get("end");
        if (beginNode != null && beginNode.isTextual()) {
          originalBegin = beginNode.asText().trim();
        }
        if (endNode != null && endNode.isTextual()) {
          originalEnd = endNode.asText().trim();
        }
        // remove the whole life-span node so Jackson won’t attempt to parse its fields
        ((ObjectNode) root).remove("life-span");
      }

      // Map the sanitized tree to the model (no LocalDate fields anymore in the JSON)
      MbAuthorApiInfo artist = null;
      try {
        artist = mapper.treeToValue(root, MbAuthorApiInfo.class);
      } catch (Exception ex) {
        // If mapping fails for any reason, log at debug (we don't need the full error in production) and try to continue without life-span
        log.debug("Mapping MbAuthorApiInfo failed, retrying without life-span: {}", ex.getMessage());
        try {
          if (root != null && root.has("life-span")) {
            ((ObjectNode) root).remove("life-span");
          }
          artist = mapper.treeToValue(root, MbAuthorApiInfo.class);
        } catch (Exception ex2) {
          log.debug("Retry mapping to MbAuthorApiInfo failed: {}", ex2.getMessage());
          return null;
        }
      }

      Author author = mbAuthorApiInfoMapper.toAuthor(artist);

      // Parse dates leniently and set them explicitly on the Author
      LocalDate parsedBegin = parseLenientDate(originalBegin);
      LocalDate parsedEnd = parseLenientDate(originalEnd);
      if (parsedBegin != null) {
        author.setLifeSpanBegin(parsedBegin);
      }
      if (parsedEnd != null) {
        author.setLifeSpanEnd(parsedEnd);
      }

      log.info("Found artist: {} (parsedBegin={}, parsedEnd={})", artist, parsedBegin, parsedEnd);
      return author;
    } catch (Exception e) {
      log.debug("Error fetching/parsing artist {} from MusicBrainz: {}", mbid, e.getMessage());
      log.trace("Full exception", e);
      return null;
    }
  }

  private LocalDate parseLenientDate(String text) {
    if (text == null) return null;
    text = text.trim();
    if (text.isEmpty()) return null;
    try {
      if (text.matches("^\\d{4}$")) {
        int y = Integer.parseInt(text);
        return LocalDate.of(y, 1, 1);
      }
      if (text.matches("^\\d{4}-\\d{2}$")) {
        YearMonth ym = YearMonth.parse(text);
        return LocalDate.of(ym.getYear(), ym.getMonthValue(), 1);
      }
      // assume full date
      return LocalDate.parse(text);
    } catch (DateTimeParseException | NumberFormatException ex) {
      log.debug("Could not parse life-span date '{}', returning null", text);
      return null;
    }
  }

}
