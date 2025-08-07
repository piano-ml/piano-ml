package org.pianoml.backend.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.pianoml.backend.api.WorkApi;
import org.pianoml.backend.model.AllWorksApiInfo;
import org.pianoml.backend.model.AllWorksApiInfoWorksInner;
import org.pianoml.backend.model.AllWorksApiInfoWorksInnerRelationsInner;
import org.pianoml.backend.service.MusicBrainzService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@RestController
public class WorkController implements WorkApi {

  @Autowired
  private MusicBrainzService musicBrainzService;

  @Override
  public ResponseEntity<AllWorksApiInfo> workSearchQueryGet(String query) {
    AllWorksApiInfo works = musicBrainzService.searchWorks(query);
    works.getWorks().forEach(w ->
      w.setRelations(
        new ArrayList<>(w.getRelations().stream()
          .filter(r -> r.getArtist() != null)
          .collect(Collectors.toMap(
            r -> r.getArtist().getName(), // clé : nom de l'artiste
            r -> r, // valeur : la relation
            (r1, r2) -> r1, // en cas de doublon, garder le premier
            java.util.LinkedHashMap::new // garder l'ordre
          ))
          .values())
      )
    );
    return ResponseEntity.ok(works);
  }
}
