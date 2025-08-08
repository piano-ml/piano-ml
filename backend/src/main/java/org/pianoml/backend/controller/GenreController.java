package org.pianoml.backend.controller;

import lombok.RequiredArgsConstructor;
import org.pianoml.backend.api.GenreApi;
import org.pianoml.backend.model.GenreApiInfo;
import org.pianoml.backend.service.GenreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class GenreController implements GenreApi {

    private GenreService genreService;

    @Override
    public ResponseEntity<GenreApiInfo> genreIdGet(String id) {
        return genreService.getGenre(UUID.fromString(id))
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @Override
    public ResponseEntity<GenreApiInfo> genreIdPut(String id, GenreApiInfo genreApiInfo) {
        return genreService.updateGenre(UUID.fromString(id), genreApiInfo)
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @Override
    public ResponseEntity<GenreApiInfo> genrePost(GenreApiInfo genreApiInfo) {
        GenreApiInfo createdGenre = genreService.createGenre(genreApiInfo);
        return new ResponseEntity<>(createdGenre, HttpStatus.CREATED);
    }

    @Override
    public ResponseEntity<List<GenreApiInfo>> genreSearchQueryGet(String query) {
        List<GenreApiInfo> genres = genreService.searchGenres(query);
        return ResponseEntity.ok(genres);
    }
}
