package org.pianoml.backend.service;

import org.pianoml.backend.model.AllWorksApiInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class MusicBrainzService {

    @Autowired
    private RestTemplate restTemplate;

    public AllWorksApiInfo searchWorks(String query) {
        String url = "https://musicbrainz.org/ws/2/work?query=" + query + "&limit=25&method=indexed&fmt=json";
        return restTemplate.getForObject(url, AllWorksApiInfo.class);
    }
}
