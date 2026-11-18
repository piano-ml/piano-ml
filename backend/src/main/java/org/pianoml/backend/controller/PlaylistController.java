package org.pianoml.backend.controller;

import org.pianoml.backend.api.PlaylistApi;
import org.pianoml.backend.api.PlaylistsApi;
import org.pianoml.backend.model.PlaylistDetail;
import org.pianoml.backend.model.PlaylistPage;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.NativeWebRequest;

import java.util.Optional;

/** GET /playlists (public, every user's playlists) and GET /playlist/{slug} (issue #278). */
@RestController
public class PlaylistController implements PlaylistApi, PlaylistsApi {

  private final PlaylistEndpoints endpoints;

  public PlaylistController(PlaylistEndpoints endpoints) {
    this.endpoints = endpoints;
  }

  /** Both generated interfaces declare it; the controller doesn't use it. */
  @Override
  public Optional<NativeWebRequest> getRequest() {
    return Optional.empty();
  }

  @Override
  public ResponseEntity<PlaylistPage> playlistsGet(Integer offset, Integer limit, String orderBy, String owner) {
    return endpoints.listAll(offset, limit, orderBy, owner);
  }

  @Override
  public ResponseEntity<PlaylistDetail> playlistSlugGet(String slug) {
    return endpoints.detail(slug);
  }
}
