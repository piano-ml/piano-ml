package org.pianoml.backend.controller;

import org.pianoml.backend.api.WorkApi;
import org.pianoml.backend.model.AllWorksApiInfo;
import org.pianoml.backend.service.MusicBrainzService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WorkController implements WorkApi {

    @Autowired
    private MusicBrainzService musicBrainzService;

    @Override
    public ResponseEntity<AllWorksApiInfo> workSearchQueryGet(String query) {
        AllWorksApiInfo works = musicBrainzService.searchWorks(query);
        return ResponseEntity.ok(works);
    }
}
