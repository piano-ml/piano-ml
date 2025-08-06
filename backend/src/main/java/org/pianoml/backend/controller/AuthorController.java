package org.pianoml.backend.controller;

import org.pianoml.backend.api.AuthorApi;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.service.AuthorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class AuthorController implements AuthorApi {

    @Autowired
    private AuthorService authorService;

    @Override
    public ResponseEntity<AuthorApiInfo> authorIdGet(String id) {
        return authorService.getAuthor(UUID.fromString(id))
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @Override
    public ResponseEntity<AuthorApiInfo> authorIdPut(String id, AuthorApiInfo authorApiInfo) {
        return authorService.updateAuthor(UUID.fromString(id), authorApiInfo)
                .map(ResponseEntity::ok)
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @Override
    public ResponseEntity<AuthorApiInfo> authorPost(AuthorApiInfo authorApiInfo) {
        AuthorApiInfo createdAuthor = authorService.createAuthor(authorApiInfo);
        return new ResponseEntity<>(createdAuthor, HttpStatus.CREATED);
    }

    @Override
    public ResponseEntity<List<AuthorApiInfo>> authorSearchQueryGet(String query) {
        List<AuthorApiInfo> authors = authorService.searchAuthors(query);
        return ResponseEntity.ok(authors);
    }
}
