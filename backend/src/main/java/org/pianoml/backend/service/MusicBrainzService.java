package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.mapper.MbAuthorApiInfoMapper;
import org.pianoml.backend.model.AllWorksApiInfo;
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
    String url = "https://musicbrainz.org/ws/2/work?query=" + query + "&limit=25&method=indexed&fmt=json";
    return restTemplate.getForObject(url, AllWorksApiInfo.class);
  }


  public Author getAuthor(UUID mbid) {
    String url = "https://musicbrainz.org/ws/2/artist/" + mbid.toString() + "?fmt=json";
    log.info("Fetching artist info from MusicBrainz: {}", url);
    org.pianoml.backend.model.MbAuthorApiInfo artist = restTemplate.getForObject(url, org.pianoml.backend.model.MbAuthorApiInfo.class);
    log.info("Found artist: {}", artist);
    return mbAuthorApiInfoMapper.toAuthor(artist);
  }


}
