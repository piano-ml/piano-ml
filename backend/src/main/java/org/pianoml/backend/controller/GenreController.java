package org.pianoml.backend.controller;

import lombok.RequiredArgsConstructor;
import org.pianoml.backend.api.GenreApi;
import org.pianoml.backend.mapper.GenreMapper;
import org.pianoml.backend.model.GenreApiInfo;
import org.pianoml.backend.service.GenreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.pianoml.backend.security.SecurityUtils.isAdmin;

@RestController
@RequiredArgsConstructor
public class GenreController implements GenreApi {

  @Autowired
  private GenreService genreService;

    @Override
    public ResponseEntity<GenreApiInfo> genreIdGet(String id) {
        return genreService.getGenre(UUID.fromString(id))
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

  @Override
  public ResponseEntity<List<GenreApiInfo>> genreGet() {
        return ResponseEntity.ok(genreService.getAllGenres());
  }

    @Override
    public ResponseEntity<GenreApiInfo> genreIdPut(String id, GenreApiInfo genreApiInfo) {
      Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
      if (!isAdmin(authentication) ) {
        return new ResponseEntity<>(HttpStatus.FORBIDDEN);
      }
      return genreService.updateGenre(UUID.fromString(id), genreApiInfo)
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @Override
    public ResponseEntity<GenreApiInfo> genrePost(GenreApiInfo genreApiInfo) {
      Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
      if (!isAdmin(authentication) ) {
        return new ResponseEntity<>(HttpStatus.FORBIDDEN);
      }

        if (genreApiInfo.getId() != null) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
      }

      Optional<GenreApiInfo> g = genreService.getGenre(UUID.fromString(genreApiInfo.getMbid()));
        if (g.isPresent()) {
            return new ResponseEntity<>(HttpStatus.OK);
        }

        GenreApiInfo createdGenre = genreService.createGenre(genreApiInfo);
        return new ResponseEntity<>(createdGenre, HttpStatus.CREATED);
    }

    @Override
    public ResponseEntity<List<GenreApiInfo>> genreSearchQueryGet(String query) {
        List<GenreApiInfo> genres = genreService.searchGenres(query);
        return ResponseEntity.ok(genres);
    }
}
