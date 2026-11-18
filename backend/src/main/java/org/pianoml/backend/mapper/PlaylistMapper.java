package org.pianoml.backend.mapper;

import org.pianoml.backend.entity.Playlist;
import org.pianoml.backend.model.PlaylistDetail;
import org.pianoml.backend.model.PlaylistItem;
import org.pianoml.backend.model.PlaylistMembership;
import org.pianoml.backend.model.PlaylistOwner;
import org.pianoml.backend.model.PlaylistPage;
import org.pianoml.backend.model.PlaylistSummary;
import org.pianoml.backend.service.PlaylistService.Membership;
import org.pianoml.backend.service.PlaylistService.PlaylistDetailView;
import org.pianoml.backend.service.PlaylistService.PlaylistPageView;
import org.pianoml.backend.service.PlaylistService.PlaylistView;
import org.springframework.stereotype.Component;

import java.util.ArrayList;

/** Playlist views of {@link org.pianoml.backend.service.PlaylistService} to API models (issue #278). */
@Component
public class PlaylistMapper {

  private final ScoreMapper scoreMapper;

  public PlaylistMapper(ScoreMapper scoreMapper) {
    this.scoreMapper = scoreMapper;
  }

  public PlaylistSummary toSummary(PlaylistView view) {
    Playlist p = view.playlist();
    PlaylistSummary api = new PlaylistSummary();
    api.setId(p.getId());
    api.setSlug(p.getSlug());
    api.setTitle(p.getTitle());
    api.setDescription(p.getDescription());
    api.setIsDefault(p.isDefault());
    api.setOwner(new PlaylistOwner().name(view.ownerName()));
    api.setItemCount(view.itemCount());
    api.setCreatedAt(p.getCreatedAt());
    api.setLastModified(p.getLastModified());
    api.setCoverImages(new ArrayList<>(view.coverImages()));
    return api;
  }

  public PlaylistPage toPage(PlaylistPageView page) {
    PlaylistPage api = new PlaylistPage();
    api.setItems(new ArrayList<>(page.items().stream().map(this::toSummary).toList()));
    api.setTotal(page.total());
    api.setOffset(page.offset());
    api.setLimit(page.limit());
    return api;
  }

  public PlaylistDetail toDetail(PlaylistDetailView detail) {
    PlaylistSummary s = toSummary(detail.summary());
    PlaylistDetail api = new PlaylistDetail();
    api.setId(s.getId());
    api.setSlug(s.getSlug());
    api.setTitle(s.getTitle());
    api.setDescription(s.getDescription());
    api.setIsDefault(s.getIsDefault());
    api.setOwner(s.getOwner());
    api.setItemCount(s.getItemCount());
    api.setCreatedAt(s.getCreatedAt());
    api.setLastModified(s.getLastModified());
    api.setCoverImages(s.getCoverImages());
    api.setItems(new ArrayList<>(detail.items().stream().map(this::toItem).toList()));
    return api;
  }

  public PlaylistItem toItem(org.pianoml.backend.entity.PlaylistItem item) {
    PlaylistItem api = new PlaylistItem();
    api.setPosition(item.getPosition());
    api.setAddedAt(item.getAddedAt());
    api.setScore(scoreMapper.toScoreApiInfo(item.getScore()));
    return api;
  }

  public PlaylistMembership toMembership(Membership m) {
    PlaylistMembership api = new PlaylistMembership();
    if (m.playlist() == null) {
      // Favorites before its first score: listed so the menu can create it
      api.setSlug(Playlist.FAVORITES_SLUG);
      api.setTitle(Playlist.FAVORITES_TITLE);
      api.setIsDefault(true);
    } else {
      api.setSlug(m.playlist().getSlug());
      api.setTitle(m.playlist().getTitle());
      api.setIsDefault(m.playlist().isDefault());
    }
    api.setItemCount(m.itemCount());
    api.setContains(m.contains());
    return api;
  }
}
