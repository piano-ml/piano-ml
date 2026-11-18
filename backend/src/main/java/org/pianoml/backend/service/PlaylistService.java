package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.Playlist;
import org.pianoml.backend.entity.PlaylistItem;
import org.pianoml.backend.entity.PlaylistItemId;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.exception.EntityNotFoundException;
import org.pianoml.backend.exception.PlaylistConflictException;
import org.pianoml.backend.exception.PlaylistLimitException;
import org.pianoml.backend.repository.PlaylistItemRepository;
import org.pianoml.backend.repository.PlaylistRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Favorites and playlists (issue #278): user-owned ordered lists of scores.
 * <ul>
 *   <li>Favorites is the owner's default playlist, slug {@value Playlist#FAVORITES_SLUG}, created on the first favorite.</li>
 *   <li>The slug is made from the title at creation, unique per owner, and never changes (a rename keeps it).</li>
 *   <li>Adding a score always appends it; positions are 0-based and dense. Item writes lock the playlist row.</li>
 *   <li>Every playlist is public to read in listings; only its owner changes it.</li>
 * </ul>
 */
@Slf4j
@Service
public class PlaylistService {

  public static final int MAX_PLAYLISTS = 100;
  public static final int MAX_ITEMS = 1000;
  public static final int DEFAULT_LIMIT = 24;
  public static final int MAX_LIMIT = 100;
  public static final int MAX_TITLE = 100;
  public static final int MAX_DESCRIPTION = 1000;
  static final int COVER_COUNT = 4;
  /** Slugs a user playlist never gets: they name Favorites, or a literal segment of the API paths. */
  static final Set<String> RESERVED_SLUGS = Set.of(Playlist.FAVORITES_SLUG, "containing");

  public enum Order { lastModified_desc, createdAt_desc, title_asc, itemCount_desc }

  /** A playlist as listed: owner name, number of visible scores, and the images of its first scores. */
  public record PlaylistView(Playlist playlist, String ownerName, int itemCount, List<String> coverImages) {}

  public record PlaylistPageView(List<PlaylistView> items, long total, int offset, int limit) {}

  public record PlaylistDetailView(PlaylistView summary, List<PlaylistItem> items) {}

  /** {@code created} is false when the score was already in the playlist (nothing changed). */
  public record AddResult(PlaylistItem item, boolean created) {}

  /** For the "Save to…" menu; {@code playlist} is null for a Favorites playlist not created yet. */
  public record Membership(Playlist playlist, int itemCount, boolean contains) {}

  private final PlaylistRepository playlistRepository;
  private final PlaylistItemRepository playlistItemRepository;
  private final ScoreRepository scoreRepository;
  private final NamedParameterJdbcTemplate jdbc;
  private final Clock clock;

  public PlaylistService(PlaylistRepository playlistRepository, PlaylistItemRepository playlistItemRepository,
                         ScoreRepository scoreRepository, NamedParameterJdbcTemplate jdbc, Clock clock) {
    this.playlistRepository = playlistRepository;
    this.playlistItemRepository = playlistItemRepository;
    this.scoreRepository = scoreRepository;
    this.jdbc = jdbc;
    this.clock = clock;
  }

  // --- listings ----------------------------------------------------------------------------------------------

  /** Every user's non-empty playlists, optionally only those of the user named {@code ownerName}. */
  @Transactional(readOnly = true)
  public PlaylistPageView listAll(String ownerName, String orderBy, Integer offset, Integer limit) {
    return page(null, blankToNull(ownerName), true, false, orderBy, offset, limit);
  }

  /** The user's own playlists, empty ones included, Favorites first. */
  @Transactional(readOnly = true)
  public PlaylistPageView listMine(User user, String orderBy, Integer offset, Integer limit) {
    return page(user.getId(), null, false, true, orderBy, offset, limit);
  }

  private PlaylistPageView page(UUID ownerId, String ownerName, boolean nonEmptyOnly, boolean defaultFirst,
                                String orderBy, Integer offsetParam, Integer limitParam) {
    int offset = offsetParam == null ? 0 : offsetParam;
    int limit = limitParam == null ? DEFAULT_LIMIT : limitParam;
    require(offset >= 0, "offset must be 0 or more");
    require(limit >= 1 && limit <= MAX_LIMIT, "limit must be between 1 and " + MAX_LIMIT);
    Order order = parseOrder(orderBy);

    MapSqlParameterSource params = new MapSqlParameterSource();
    StringBuilder base = new StringBuilder(
      "SELECT p.id, p.owner_id, p.title, p.slug, p.description, p.is_default, p.created_at, p.last_modified,"
        + " u.name AS owner_name,"
        + " (SELECT COUNT(*) FROM pianoml.playlist_item i JOIN pianoml.score s ON s.id = i.score_id"
        + "   WHERE i.playlist_id = p.id AND s.deleted = false) AS item_count"
        + " FROM pianoml.playlist p JOIN pianoml.\"user\" u ON u.id = p.owner_id WHERE 1 = 1");
    if (ownerId != null) {
      base.append(" AND p.owner_id = :ownerId");
      params.addValue("ownerId", ownerId);
    }
    if (ownerName != null) {
      base.append(" AND u.name = :ownerName");
      params.addValue("ownerName", ownerName);
    }
    String from = " FROM (" + base + ") t" + (nonEmptyOnly ? " WHERE t.item_count > 0" : "");

    Long total = jdbc.queryForObject("SELECT COUNT(*)" + from, params, Long.class);

    String sort = switch (order) {
      case lastModified_desc -> "t.last_modified DESC";
      case createdAt_desc -> "t.created_at DESC";
      case title_asc -> "LOWER(t.title) ASC";
      case itemCount_desc -> "t.item_count DESC, t.last_modified DESC";
    };
    String sql = "SELECT *" + from + " ORDER BY " + (defaultFirst ? "t.is_default DESC, " : "") + sort + ", t.id"
      + " LIMIT :limit OFFSET :offset";
    params.addValue("limit", limit).addValue("offset", offset);

    record Row(Playlist playlist, String ownerName, int itemCount) {}
    List<Row> rows = jdbc.query(sql, params, (rs, i) -> {
      Playlist p = new Playlist();
      p.setId(rs.getObject("id", UUID.class));
      p.setOwnerId(rs.getObject("owner_id", UUID.class));
      p.setTitle(rs.getString("title"));
      p.setSlug(rs.getString("slug"));
      p.setDescription(rs.getString("description"));
      p.setDefault(rs.getBoolean("is_default"));
      p.setCreatedAt(rs.getObject("created_at", OffsetDateTime.class));
      p.setLastModified(rs.getObject("last_modified", OffsetDateTime.class));
      return new Row(p, rs.getString("owner_name"), rs.getInt("item_count"));
    });

    Map<UUID, List<String>> covers = coverImages(rows.stream().map(r -> r.playlist().getId()).toList());
    List<PlaylistView> items = rows.stream()
      .map(r -> new PlaylistView(r.playlist(), r.ownerName(), r.itemCount(),
        covers.getOrDefault(r.playlist().getId(), List.of())))
      .toList();
    return new PlaylistPageView(items, total == null ? 0 : total, offset, limit);
  }

  /** Images of the first {@value #COVER_COUNT} visible scores of each playlist, in one query for the whole page. */
  private Map<UUID, List<String>> coverImages(Collection<UUID> playlistIds) {
    Map<UUID, List<String>> covers = new HashMap<>();
    if (playlistIds.isEmpty()) {
      return covers;
    }
    String sql = "SELECT t.playlist_id, t.image FROM ("
      + " SELECT i.playlist_id, s.image, ROW_NUMBER() OVER (PARTITION BY i.playlist_id ORDER BY i.position) AS rn"
      + " FROM pianoml.playlist_item i JOIN pianoml.score s ON s.id = i.score_id"
      + " WHERE i.playlist_id IN (:ids) AND s.deleted = false AND s.image IS NOT NULL) t"
      + " WHERE t.rn <= " + COVER_COUNT + " ORDER BY t.playlist_id, t.rn";
    jdbc.query(sql, new MapSqlParameterSource("ids", playlistIds), rs -> {
      covers.computeIfAbsent(rs.getObject("playlist_id", UUID.class), k -> new ArrayList<>()).add(rs.getString("image"));
    });
    return covers;
  }

  private Map<UUID, Integer> visibleCounts(Collection<UUID> playlistIds) {
    Map<UUID, Integer> counts = new HashMap<>();
    if (playlistIds.isEmpty()) {
      return counts;
    }
    String sql = "SELECT i.playlist_id, COUNT(*) AS n FROM pianoml.playlist_item i"
      + " JOIN pianoml.score s ON s.id = i.score_id WHERE i.playlist_id IN (:ids) AND s.deleted = false"
      + " GROUP BY i.playlist_id";
    jdbc.query(sql, new MapSqlParameterSource("ids", playlistIds),
      rs -> { counts.put(rs.getObject("playlist_id", UUID.class), rs.getInt("n")); });
    return counts;
  }

  /** The listing view of one playlist. */
  public PlaylistView view(Playlist playlist, User owner) {
    UUID id = playlist.getId();
    return new PlaylistView(playlist, owner.getName(), visibleCounts(List.of(id)).getOrDefault(id, 0),
      coverImages(List.of(id)).getOrDefault(id, List.of()));
  }

  // --- one playlist ------------------------------------------------------------------------------------------

  /** One of the user's playlists with its visible items in order. */
  @Transactional(readOnly = true)
  public PlaylistDetailView detail(User user, String slug) {
    return detailOf(own(user, slug), user);
  }

  private PlaylistDetailView detailOf(Playlist playlist, User owner) {
    List<PlaylistItem> items = playlistItemRepository.findVisibleWithScore(playlist.getId());
    List<String> covers = items.stream()
      .map(i -> i.getScore().getImage())
      .filter(image -> image != null)
      .limit(COVER_COUNT)
      .toList();
    return new PlaylistDetailView(new PlaylistView(playlist, owner.getName(), items.size(), covers), items);
  }

  /** @throws PlaylistLimitException (422) when the user already has {@value #MAX_PLAYLISTS} playlists */
  @Transactional
  public Playlist create(User user, String title, String description) {
    String cleanTitle = validTitle(title);
    String cleanDescription = validDescription(description);
    if (playlistRepository.countByOwnerId(user.getId()) >= MAX_PLAYLISTS) {
      throw new PlaylistLimitException("A user has at most " + MAX_PLAYLISTS + " playlists");
    }
    OffsetDateTime now = now();
    Playlist playlist = new Playlist();
    playlist.setId(UUID.randomUUID());
    playlist.setOwnerId(user.getId());
    playlist.setTitle(cleanTitle);
    playlist.setSlug(uniqueSlug(user.getId(), cleanTitle));
    playlist.setDescription(cleanDescription);
    playlist.setDefault(false);
    playlist.setCreatedAt(now);
    playlist.setLastModified(now);
    return playlistRepository.saveAndFlush(playlist);
  }

  /** Renames the playlist and/or changes its description; null leaves a field as it is. The slug never changes. */
  @Transactional
  public Playlist update(User user, String slug, String title, String description) {
    Playlist playlist = own(user, slug);
    if (title != null) {
      playlist.setTitle(validTitle(title));
    }
    if (description != null) {
      playlist.setDescription(validDescription(description));
    }
    playlist.setLastModified(now());
    return playlistRepository.save(playlist);
  }

  /** @throws PlaylistConflictException (409) for Favorites, which can be renamed but not deleted */
  @Transactional
  public void delete(User user, String slug) {
    Playlist playlist = own(user, slug);
    if (playlist.isDefault()) {
      throw new PlaylistConflictException("Favorites cannot be deleted");
    }
    playlistRepository.delete(playlist);
  }

  // --- items -------------------------------------------------------------------------------------------------

  /**
   * Appends the score at the end of the playlist; idempotent. With slug {@value Playlist#FAVORITES_SLUG}, creates
   * the Favorites playlist the first time.
   *
   * @throws EntityNotFoundException (404) for an unknown playlist, or an unknown or deleted score
   * @throws PlaylistLimitException  (422) when the playlist already has {@value #MAX_ITEMS} items
   */
  @Transactional
  public AddResult addItem(User user, String slug, UUID scoreId) {
    require(scoreId != null, "scoreId is required");
    Playlist playlist = Playlist.FAVORITES_SLUG.equals(slug) ? favoritesOrCreate(user) : own(user, slug);
    playlist = lock(playlist);
    Score score = scoreRepository.findById(scoreId)
      .filter(s -> !Boolean.TRUE.equals(s.getDeleted()))
      .orElseThrow(() -> new EntityNotFoundException("Score not found: " + scoreId));

    Optional<PlaylistItem> existing = playlistItemRepository.findById(new PlaylistItemId(playlist.getId(), scoreId));
    if (existing.isPresent()) {
      existing.get().setScore(score);
      return new AddResult(existing.get(), false);
    }
    if (playlistItemRepository.countByPlaylistId(playlist.getId()) >= MAX_ITEMS) {
      throw new PlaylistLimitException("A playlist has at most " + MAX_ITEMS + " scores");
    }
    OffsetDateTime now = now();
    PlaylistItem item = new PlaylistItem();
    item.setPlaylistId(playlist.getId());
    item.setScoreId(scoreId);
    item.setPosition(playlistItemRepository.maxPosition(playlist.getId()) + 1);
    item.setAddedAt(now);
    PlaylistItem saved = playlistItemRepository.saveAndFlush(item);
    saved.setScore(score);
    playlist.setLastModified(now);
    return new AddResult(saved, true);
  }

  /** Removes the score; nothing happens when it is not there (or when Favorites does not exist yet). */
  @Transactional
  public void removeItem(User user, String slug, UUID scoreId) {
    Optional<Playlist> found = playlistRepository.findByOwnerIdAndSlug(user.getId(), slug);
    if (found.isEmpty()) {
      if (Playlist.FAVORITES_SLUG.equals(slug)) {
        return;
      }
      throw notFound(slug);
    }
    Playlist playlist = lock(found.get());
    Optional<PlaylistItem> item = playlistItemRepository.findById(new PlaylistItemId(playlist.getId(), scoreId));
    if (item.isEmpty()) {
      return;
    }
    int position = item.get().getPosition();
    playlistItemRepository.delete(item.get());
    playlistItemRepository.closeGap(playlist.getId(), position);
    // closeGap cleared the persistence context: write the change through a fresh copy of the playlist
    playlistRepository.findById(playlist.getId()).ifPresent(p -> p.setLastModified(now()));
  }

  /**
   * Puts the playlist's scores in the order of {@code scoreIds}, which must list every visible score exactly once.
   * Scores hidden since (deleted) keep their rows, after the visible ones.
   *
   * @throws PlaylistConflictException (409) when the list does not match the playlist (the client's copy is stale)
   */
  @Transactional
  public PlaylistDetailView reorder(User user, String slug, List<UUID> scoreIds) {
    Playlist playlist = lock(own(user, slug));
    List<UUID> requested = scoreIds == null ? List.of() : scoreIds;
    List<UUID> visible = playlistItemRepository.findVisibleScoreIds(playlist.getId());
    if (requested.size() != visible.size() || new HashSet<>(requested).size() != requested.size()
      || !new HashSet<>(requested).equals(new HashSet<>(visible))) {
      throw new PlaylistConflictException("The list does not match the playlist's scores");
    }
    Map<UUID, PlaylistItem> items = new LinkedHashMap<>();
    for (PlaylistItem item : playlistItemRepository.findByPlaylistIdOrderByPosition(playlist.getId())) {
      items.put(item.getScoreId(), item);
    }
    int position = 0;
    for (UUID scoreId : requested) {
      items.remove(scoreId).setPosition(position++);
    }
    for (PlaylistItem hidden : items.values()) {
      hidden.setPosition(position++);
    }
    playlist.setLastModified(now());
    playlistItemRepository.flush();
    return detailOf(playlist, user);
  }

  /** Ids of the visible scores in the user's Favorites. */
  @Transactional(readOnly = true)
  public List<UUID> favoriteIds(User user) {
    return playlistRepository.findByOwnerIdAndSlug(user.getId(), Playlist.FAVORITES_SLUG)
      .map(p -> playlistItemRepository.findVisibleScoreIds(p.getId()))
      .orElse(List.of());
  }

  /** The user's playlists for "Save to…": Favorites first (even before it exists), then most recently modified. */
  @Transactional(readOnly = true)
  public List<Membership> membership(User user, UUID scoreId) {
    List<Playlist> playlists = playlistRepository.findAllOfOwner(user.getId());
    List<UUID> ids = playlists.stream().map(Playlist::getId).toList();
    Set<UUID> containing = ids.isEmpty() ? Set.of()
      : new HashSet<>(playlistItemRepository.findPlaylistsContaining(scoreId, ids));
    Map<UUID, Integer> counts = visibleCounts(ids);
    List<Membership> result = new ArrayList<>();
    if (playlists.stream().noneMatch(Playlist::isDefault)) {
      result.add(new Membership(null, 0, false));
    }
    for (Playlist p : playlists) {
      result.add(new Membership(p, counts.getOrDefault(p.getId(), 0), containing.contains(p.getId())));
    }
    return result;
  }

  // --- helpers -----------------------------------------------------------------------------------------------

  private Playlist favoritesOrCreate(User user) {
    return playlistRepository.findByOwnerIdAndSlug(user.getId(), Playlist.FAVORITES_SLUG).orElseGet(() -> {
      OffsetDateTime now = now();
      Playlist favorites = new Playlist();
      favorites.setId(UUID.randomUUID());
      favorites.setOwnerId(user.getId());
      favorites.setTitle(Playlist.FAVORITES_TITLE);
      favorites.setSlug(Playlist.FAVORITES_SLUG);
      favorites.setDefault(true);
      favorites.setCreatedAt(now);
      favorites.setLastModified(now);
      log.debug("Creating the Favorites playlist of user {}", user.getId());
      // A concurrent first favorite fails here on uq_playlist_owner_slug; the controller retries once.
      return playlistRepository.saveAndFlush(favorites);
    });
  }

  private Playlist own(User user, String slug) {
    return playlistRepository.findByOwnerIdAndSlug(user.getId(), slug).orElseThrow(() -> notFound(slug));
  }

  private Playlist lock(Playlist playlist) {
    return playlistRepository.lockById(playlist.getId()).orElseThrow(() -> notFound(playlist.getSlug()));
  }

  private static EntityNotFoundException notFound(String slug) {
    return new EntityNotFoundException("Playlist not found: " + slug);
  }

  /**
   * The slug of a new playlist: its title as a slug, made unique among the owner's playlists with "-2", "-3"...
   * Reserved slugs are never given to a user playlist.
   */
  String uniqueSlug(UUID ownerId, String title) {
    String base = SlugUtils.normalizeToSlug(title, false);
    if (base.length() > MAX_TITLE) {
      base = base.substring(0, MAX_TITLE).replaceAll("-+$", "");
    }
    if (base.isEmpty()) {
      base = "playlist";
    }
    Set<String> taken = new HashSet<>(playlistRepository.findSlugsLike(ownerId, base));
    taken.addAll(RESERVED_SLUGS);
    if (!taken.contains(base)) {
      return base;
    }
    int n = 2;
    while (taken.contains(base + "-" + n)) {
      n++;
    }
    return base + "-" + n;
  }

  static Order parseOrder(String orderBy) {
    if (orderBy == null || orderBy.isBlank()) {
      return Order.lastModified_desc;
    }
    try {
      return Order.valueOf(orderBy);
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException("Unknown orderBy: " + orderBy);
    }
  }

  static String validTitle(String title) {
    String clean = title == null ? "" : title.trim();
    require(!clean.isEmpty(), "title is required");
    require(clean.length() <= MAX_TITLE, "title is longer than " + MAX_TITLE + " characters");
    return clean;
  }

  /** Trimmed; empty means no description. */
  static String validDescription(String description) {
    String clean = blankToNull(description);
    require(clean == null || clean.length() <= MAX_DESCRIPTION,
      "description is longer than " + MAX_DESCRIPTION + " characters");
    return clean;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock);
  }

  private static void require(boolean condition, String message) {
    if (!condition) {
      throw new IllegalArgumentException(message);
    }
  }
}
