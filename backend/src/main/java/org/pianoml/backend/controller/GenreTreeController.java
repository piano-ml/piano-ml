package org.pianoml.backend.controller;

import lombok.RequiredArgsConstructor;
import org.pianoml.backend.model.GenreTreeNodeDto;
import org.pianoml.backend.model.GenreTreeUpdateDto;
import org.pianoml.backend.service.GenreTreeService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.pianoml.backend.security.SecurityUtils.isAdmin;

@RestController
@RequiredArgsConstructor
public class GenreTreeController {

  private final GenreTreeService genreTreeService;

  @GetMapping("/genre_tree")
  public ResponseEntity<List<GenreTreeNodeDto>> getGenreTree(@RequestParam(name = "root_id", required = false) UUID rootId) {
    List<GenreTreeNodeDto> result = genreTreeService.getTree(Optional.ofNullable(rootId));
    return ResponseEntity.ok(result);
  }

  @PutMapping("/genre_tree/{id}")
  public ResponseEntity<?> putGenreTreeNode(@PathVariable("id") UUID id, @RequestBody GenreTreeUpdateDto update) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (!isAdmin(authentication)) {
      return new ResponseEntity<>(HttpStatus.FORBIDDEN);
    }

    UUID parentId = update == null ? null : update.getParent_id();

    GenreTreeService.UpsertResult res = genreTreeService.upsertNode(id, parentId);
    switch (res.getStatus()) {
      case CREATED:
        return new ResponseEntity<>(res.getDto(), HttpStatus.CREATED);
      case UPDATED:
        return ResponseEntity.ok(res.getDto());
      case BAD_REQUEST:
        return new ResponseEntity<>(res.getMessage(), HttpStatus.BAD_REQUEST);
      case NOT_FOUND:
        return new ResponseEntity<>(res.getMessage(), HttpStatus.NOT_FOUND);
      case CONFLICT:
        return new ResponseEntity<>(res.getMessage(), HttpStatus.CONFLICT);
      default:
        return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

