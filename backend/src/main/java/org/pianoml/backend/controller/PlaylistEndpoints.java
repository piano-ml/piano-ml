package org.pianoml.backend.controller;

import org.pianoml.backend.entity.Playlist;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.mapper.PlaylistMapper;
import org.pianoml.backend.model.PlaylistCreate;
import org.pianoml.backend.model.PlaylistDetail;
import org.pianoml.backend.model.PlaylistItem;
import org.pianoml.backend.model.PlaylistItemAdd;
import org.pianoml.backend.model.PlaylistMembership;
import org.pianoml.backend.model.PlaylistOrder;
import org.pianoml.backend.model.PlaylistPage;
import org.pianoml.backend.model.PlaylistSummary;
import org.pianoml.backend.model.PlaylistUpdate;
import org.pianoml.backend.service.AccountService;
import org.pianoml.backend.service.PlaylistService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * The playlist endpoints (issue #278). The generated interfaces split them by first path segment:
 * {@link PlaylistController} serves /playlists and /playlist/{slug}, {@link AccountController} the
 * /account/playlist... ones, and both delegate here.
 * <p>
 * Only {@code GET /playlists} is public. GET requests are open in {@link org.pianoml.backend.config.SecurityConfig},
 * so the other reads resolve the user themselves and answer 401 without one.
 */
@Component
public class PlaylistEndpoints {

  private final PlaylistService playlistService;
  private final PlaylistMapper playlistMapper;
  private final AccountService accountService;

  public PlaylistEndpoints(PlaylistService playlistService, PlaylistMapper playlistMapper, AccountService accountService) {
    this.playlistService = playlistService;
    this.playlistMapper = playlistMapper;
    this.accountService = accountService;
  }

  public ResponseEntity<PlaylistPage> listAll(Integer offset, Integer limit, String orderBy, String owner) {
    return ResponseEntity.ok(playlistMapper.toPage(playlistService.listAll(owner, orderBy, offset, limit)));
  }

  public ResponseEntity<PlaylistPage> listMine(Integer offset, Integer limit, String orderBy) {
    return ResponseEntity.ok(playlistMapper.toPage(playlistService.listMine(currentUser(), orderBy, offset, limit)));
  }

  public ResponseEntity<PlaylistDetail> detail(String slug) {
    return ResponseEntity.ok(playlistMapper.toDetail(playlistService.detail(currentUser(), slug)));
  }

  public ResponseEntity<PlaylistSummary> create(PlaylistCreate body) {
    User user = currentUser();
    // Two creations with the same title can race for the same slug: the second one retries with the next slug
    Playlist created = retryOnce(() -> playlistService.create(user, body.getTitle(), body.getDescription()));
    return ResponseEntity.status(HttpStatus.CREATED).body(playlistMapper.toSummary(playlistService.view(created, user)));
  }

  public ResponseEntity<PlaylistSummary> update(String slug, PlaylistUpdate body) {
    User user = currentUser();
    Playlist updated = playlistService.update(user, slug, body.getTitle(), body.getDescription());
    return ResponseEntity.ok(playlistMapper.toSummary(playlistService.view(updated, user)));
  }

  public ResponseEntity<Void> delete(String slug) {
    playlistService.delete(currentUser(), slug);
    return ResponseEntity.noContent().build();
  }

  public ResponseEntity<PlaylistItem> addItem(String slug, PlaylistItemAdd body) {
    User user = currentUser();
    // Two first favorites can race to create Favorites: the second one retries and finds it
    PlaylistService.AddResult result = retryOnce(() -> playlistService.addItem(user, slug, body.getScoreId()));
    return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
      .body(playlistMapper.toItem(result.item()));
  }

  public ResponseEntity<Void> removeItem(String slug, UUID scoreId) {
    playlistService.removeItem(currentUser(), slug, scoreId);
    return ResponseEntity.noContent().build();
  }

  public ResponseEntity<PlaylistDetail> reorder(String slug, PlaylistOrder body) {
    return ResponseEntity.ok(playlistMapper.toDetail(playlistService.reorder(currentUser(), slug, body.getScoreIds())));
  }

  public ResponseEntity<List<UUID>> favoriteIds() {
    return ResponseEntity.ok(playlistService.favoriteIds(currentUser()));
  }

  public ResponseEntity<List<PlaylistMembership>> membership(UUID scoreId) {
    return ResponseEntity.ok(playlistService.membership(currentUser(), scoreId).stream()
      .map(playlistMapper::toMembership).toList());
  }

  private static <T> T retryOnce(Supplier<T> write) {
    try {
      return write.get();
    } catch (DataIntegrityViolationException e) {
      return write.get();
    }
  }

  /** @throws org.pianoml.backend.exception.UserNotLoggedInException (401) for an anonymous request */
  private User currentUser() {
    return accountService.getUserFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
  }
}
