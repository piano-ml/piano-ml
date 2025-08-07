package org.pianoml.backend.controller;

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
public class GenreController implements GenreApi {

    @Autowired
    private GenreService genreService;

    @Override
    public ResponseEntity<List<GenreApiInfo>> genreGet() {
        List<GenreApiInfo> genres = genreService.getAllGenres();
        return ResponseEntity.ok(genres);
    }

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
    public ResponseEntity<List<GenreApiInfo>> genrePost(List<GenreApiInfo> genreApiInfo) {
        List<GenreApiInfo> createdGenres = genreService.createGenres(genreApiInfo);
        return new ResponseEntity<>(createdGenres, HttpStatus.CREATED);
    }
}
