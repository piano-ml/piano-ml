package org.pianoml.backend.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.pianoml.backend.service.PlaylistService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Favorites and playlists end to end (issue #278), on the schema built by Liquibase (changelog 023): ordering,
 * immutable slugs, lazy Favorites, ownership, pagination, limits and cascades.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PlaylistControllerTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private UserRepository userRepository;
  @Autowired private JwtTokenProvider jwtTokenProvider;

  private UUID authorId;
  private final List<UUID> createdScores = new ArrayList<>();
  private final List<UUID> createdUsers = new ArrayList<>();

  @BeforeEach
  void author() {
    authorId = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.author (id, name) VALUES (?, ?)", authorId, "Composer " + authorId);
  }

  @AfterEach
  void cleanup() {
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.playlist WHERE owner_id = ?", userId);
    }
    for (UUID scoreId : createdScores) {
      jdbc.update("DELETE FROM pianoml.score WHERE id = ?", scoreId);
    }
    for (UUID userId : createdUsers) {
      jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", userId);
    }
    jdbc.update("DELETE FROM pianoml.author WHERE id = ?", authorId);
  }

  private User newUser() {
    User user = new User();
    user.setEmail(UUID.randomUUID() + "@example.com");
    user.setName("pianist-" + UUID.randomUUID());
    user.setPassword("{noop}unused");
    user.setRoles("USER");
    user.setVerified(true);
    User saved = userRepository.save(user);
    createdUsers.add(saved.getId());
    return saved;
  }

  private UUID newScore(UUID ownerId, String title) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO pianoml.score (id, title, author_id, owner_id, mbid, has_files, deleted, immutable_slug, duration, image)"
        + " VALUES (?, ?, ?, ?, ?, false, false, ?, 0, ?)",
      id, title, authorId, ownerId, UUID.randomUUID(), "slug-" + id, "https://img.example/" + id + ".png");
    createdScores.add(id);
    return id;
  }

  private String bearer(User user) {
    return "Bearer " + jwtTokenProvider.generateToken(user);
  }

  private int count(String sql, Object... args) {
    return jdbc.queryForObject(sql, Integer.class, args);
  }

  private ResultActions createPlaylist(User user, String title) throws Exception {
    return mockMvc.perform(post("/account/playlist").header("Authorization", bearer(user))
      .contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"" + title + "\"}"));
  }

  private ResultActions add(User user, String slug, UUID scoreId) throws Exception {
    return mockMvc.perform(post("/account/playlist/" + slug + "/items").header("Authorization", bearer(user))
      .contentType(MediaType.APPLICATION_JSON).content("{\"scoreId\": \"" + scoreId + "\"}"));
  }

  private ResultActions remove(User user, String slug, UUID scoreId) throws Exception {
    return mockMvc.perform(delete("/account/playlist/" + slug + "/items/" + scoreId).header("Authorization", bearer(user)));
  }

  private ResultActions reorder(User user, String slug, UUID... scoreIds) throws Exception {
    String ids = String.join(",", java.util.Arrays.stream(scoreIds).map(id -> "\"" + id + "\"").toList());
    return mockMvc.perform(put("/account/playlist/" + slug + "/items/order").header("Authorization", bearer(user))
      .contentType(MediaType.APPLICATION_JSON).content("{\"scoreIds\": [" + ids + "]}"));
  }

  private ResultActions detail(User user, String slug) throws Exception {
    return mockMvc.perform(get("/playlist/" + slug).header("Authorization", bearer(user)));
  }

  private List<Integer> positions(UUID ownerId, String slug) {
    return jdbc.queryForList("SELECT i.position FROM pianoml.playlist_item i JOIN pianoml.playlist p ON p.id = i.playlist_id"
      + " WHERE p.owner_id = ? AND p.slug = ? ORDER BY i.position", Integer.class, ownerId, slug);
  }

  // --- favorites ---------------------------------------------------------------------------------------------

  @Test
  void firstFavorite_createsFavoritesOnce_andAddingTwiceIsIdempotent() throws Exception {
    User user = newUser();
    UUID score = newScore(user.getId(), "Prelude");

    mockMvc.perform(get("/account/playlist/favorites/ids").header("Authorization", bearer(user)))
      .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    assertThat(count("SELECT COUNT(*) FROM pianoml.playlist WHERE owner_id = ?", user.getId())).isZero();

    add(user, "favorites", score).andExpect(status().isCreated())
      .andExpect(jsonPath("$.position").value(0))
      .andExpect(jsonPath("$.score.title").value("Prelude"));
    add(user, "favorites", score).andExpect(status().isOk()).andExpect(jsonPath("$.position").value(0));

    assertThat(count("SELECT COUNT(*) FROM pianoml.playlist WHERE owner_id = ? AND is_default = true AND slug = 'favorites'",
      user.getId())).isEqualTo(1);
    mockMvc.perform(get("/account/playlist/favorites/ids").header("Authorization", bearer(user)))
      .andExpect(jsonPath("$", contains(score.toString())));

    remove(user, "favorites", score).andExpect(status().isNoContent());
    remove(user, "favorites", score).andExpect(status().isNoContent());
    mockMvc.perform(get("/account/playlist/favorites/ids").header("Authorization", bearer(user)))
      .andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void removingAFavorite_beforeFavoritesExists_isANoOp() throws Exception {
    User user = newUser();
    remove(user, "favorites", UUID.randomUUID()).andExpect(status().isNoContent());
    remove(user, "no-such-playlist", UUID.randomUUID()).andExpect(status().isNotFound());
  }

  @Test
  void concurrentFirstFavorites_createASingleFavoritesPlaylist() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    UUID b = newScore(user.getId(), "B");
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Callable<Integer>> calls = List.of(
        () -> add(user, "favorites", a).andReturn().getResponse().getStatus(),
        () -> add(user, "favorites", b).andReturn().getResponse().getStatus());
      for (Future<Integer> f : pool.invokeAll(calls)) {
        assertThat(f.get()).isEqualTo(201);
      }
    } finally {
      pool.shutdown();
    }
    assertThat(count("SELECT COUNT(*) FROM pianoml.playlist WHERE owner_id = ?", user.getId())).isEqualTo(1);
    assertThat(positions(user.getId(), "favorites")).containsExactly(0, 1);
  }

  @Test
  void favorites_canBeRenamed_butNotDeleted() throws Exception {
    User user = newUser();
    add(user, "favorites", newScore(user.getId(), "A")).andExpect(status().isCreated());
    mockMvc.perform(patch("/account/playlist/favorites").header("Authorization", bearer(user))
        .contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"Coups de cœur\"}"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.title").value("Coups de cœur"))
      .andExpect(jsonPath("$.slug").value("favorites"));
    mockMvc.perform(delete("/account/playlist/favorites").header("Authorization", bearer(user)))
      .andExpect(status().isConflict());
  }

  // --- slugs -------------------------------------------------------------------------------------------------

  @Test
  void slug_isMadeOnceFromTheTitle_uniquePerOwner_andReserved() throws Exception {
    User user = newUser();
    User other = newUser();
    createPlaylist(user, "Récital 2027").andExpect(status().isCreated()).andExpect(jsonPath("$.slug").value("recital-2027"));
    createPlaylist(user, "Recital 2027").andExpect(jsonPath("$.slug").value("recital-2027-2"));
    createPlaylist(user, "recital  2027!").andExpect(jsonPath("$.slug").value("recital-2027-3"));
    createPlaylist(other, "Recital 2027").andExpect(jsonPath("$.slug").value("recital-2027"));
    createPlaylist(user, "Favorites").andExpect(jsonPath("$.slug").value("favorites-2"))
      .andExpect(jsonPath("$.isDefault").value(false));
    createPlaylist(user, "Containing").andExpect(jsonPath("$.slug").value("containing-2"));
    createPlaylist(user, "♪♪").andExpect(jsonPath("$.slug").value("playlist"));

    mockMvc.perform(patch("/account/playlist/recital-2027").header("Authorization", bearer(user))
        .contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"June concert\", \"description\": \"For June\"}"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.title").value("June concert"))
      .andExpect(jsonPath("$.description").value("For June"))
      .andExpect(jsonPath("$.slug").value("recital-2027"));
    detail(user, "recital-2027").andExpect(status().isOk()).andExpect(jsonPath("$.title").value("June concert"));

    mockMvc.perform(patch("/account/playlist/recital-2027").header("Authorization", bearer(user))
        .contentType(MediaType.APPLICATION_JSON).content("{\"description\": \"  \"}"))
      .andExpect(jsonPath("$.title").value("June concert"))
      .andExpect(jsonPath("$.description").doesNotExist());
  }

  @Test
  void invalidTitle_is400() throws Exception {
    User user = newUser();
    createPlaylist(user, "   ").andExpect(status().isBadRequest());
    createPlaylist(user, "x".repeat(101)).andExpect(status().isBadRequest());
  }

  // --- ordering ----------------------------------------------------------------------------------------------

  @Test
  void items_areAppended_removalKeepsPositionsDense_andReorderRewritesThem() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    UUID b = newScore(user.getId(), "B");
    UUID c = newScore(user.getId(), "C");
    createPlaylist(user, "Mix").andExpect(status().isCreated());
    add(user, "mix", a).andExpect(jsonPath("$.position").value(0));
    add(user, "mix", b).andExpect(jsonPath("$.position").value(1));
    add(user, "mix", c).andExpect(jsonPath("$.position").value(2));

    remove(user, "mix", a).andExpect(status().isNoContent());
    assertThat(positions(user.getId(), "mix")).containsExactly(0, 1);
    add(user, "mix", a).andExpect(jsonPath("$.position").value(2));

    reorder(user, "mix", a, c, b).andExpect(status().isOk())
      .andExpect(jsonPath("$.items[*].score.title", contains("A", "C", "B")))
      .andExpect(jsonPath("$.items[*].position", contains(0, 1, 2)))
      .andExpect(jsonPath("$.itemCount").value(3))
      .andExpect(jsonPath("$.coverImages", hasSize(3)));
    detail(user, "mix").andExpect(jsonPath("$.items[*].score.title", contains("A", "C", "B")));
  }

  @Test
  void reorder_withAStaleList_is409() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    UUID b = newScore(user.getId(), "B");
    createPlaylist(user, "Mix");
    add(user, "mix", a);
    add(user, "mix", b);
    reorder(user, "mix", a).andExpect(status().isConflict());
    reorder(user, "mix", a, a).andExpect(status().isConflict());
    reorder(user, "mix", a, UUID.randomUUID()).andExpect(status().isConflict());
    reorder(user, "mix", b, a).andExpect(status().isOk());
  }

  @Test
  void deletedScores_areHidden_andKeptAfterTheVisibleOnesOnReorder() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    UUID b = newScore(user.getId(), "B");
    UUID c = newScore(user.getId(), "C");
    createPlaylist(user, "Mix");
    add(user, "mix", a);
    add(user, "mix", b);
    add(user, "mix", c);
    jdbc.update("UPDATE pianoml.score SET deleted = true WHERE id = ?", a);

    detail(user, "mix").andExpect(jsonPath("$.items[*].score.title", contains("B", "C")))
      .andExpect(jsonPath("$.itemCount").value(2));
    reorder(user, "mix", c, b).andExpect(status().isOk())
      .andExpect(jsonPath("$.items[*].score.title", contains("C", "B")));
    assertThat(jdbc.queryForObject("SELECT position FROM pianoml.playlist_item WHERE score_id = ?", Integer.class, a))
      .isEqualTo(2);
    add(user, "mix", a).andExpect(status().isNotFound());
  }

  @Test
  void lastModified_movesOnItemChanges() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    createPlaylist(user, "Mix");
    jdbc.update("UPDATE pianoml.playlist SET last_modified = TIMESTAMP WITH TIME ZONE '2020-01-01 00:00:00+00' WHERE owner_id = ?", user.getId());
    add(user, "mix", a);
    assertThat(count("SELECT COUNT(*) FROM pianoml.playlist WHERE owner_id = ? AND last_modified > TIMESTAMP WITH TIME ZONE '2021-01-01 00:00:00+00'",
      user.getId())).isEqualTo(1);
  }

  // --- ownership and auth ------------------------------------------------------------------------------------

  @Test
  void anotherUsersPlaylist_is404() throws Exception {
    User owner = newUser();
    User intruder = newUser();
    UUID a = newScore(owner.getId(), "A");
    createPlaylist(owner, "Mine");
    add(owner, "mine", a);

    detail(intruder, "mine").andExpect(status().isNotFound());
    add(intruder, "mine", a).andExpect(status().isNotFound());
    remove(intruder, "mine", a).andExpect(status().isNotFound());
    reorder(intruder, "mine", a).andExpect(status().isNotFound());
    mockMvc.perform(delete("/account/playlist/mine").header("Authorization", bearer(intruder)))
      .andExpect(status().isNotFound());
    assertThat(positions(owner.getId(), "mine")).containsExactly(0);
  }

  @Test
  void everythingButThePublicListing_needsALogin() throws Exception {
    mockMvc.perform(get("/playlists")).andExpect(status().isOk());
    mockMvc.perform(get("/account/playlists")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/playlist/favorites")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/account/playlist/favorites/ids")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/account/playlist/containing/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
    mockMvc.perform(post("/account/playlist").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}"))
      .andExpect(status().is4xxClientError());
  }

  @Test
  void unknownScore_is404() throws Exception {
    User user = newUser();
    add(user, "favorites", UUID.randomUUID()).andExpect(status().isNotFound());
  }

  // --- listings ----------------------------------------------------------------------------------------------

  @Test
  void myPlaylists_arePaginated_withFavoritesFirstOnThePage1Only() throws Exception {
    User user = newUser();
    for (int i = 1; i <= 5; i++) {
      createPlaylist(user, "List " + i).andExpect(status().isCreated());
    }
    add(user, "favorites", newScore(user.getId(), "A"));

    mockMvc.perform(get("/account/playlists?limit=2&orderBy=title_asc").header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.total").value(6))
      .andExpect(jsonPath("$.items[*].title", contains("Favorites", "List 1")))
      .andExpect(jsonPath("$.items[0].isDefault").value(true))
      .andExpect(jsonPath("$.items[0].itemCount").value(1))
      .andExpect(jsonPath("$.items[0].coverImages", hasSize(1)))
      .andExpect(jsonPath("$.items[0].owner.name").value(user.getName()));
    mockMvc.perform(get("/account/playlists?offset=2&limit=2&orderBy=title_asc").header("Authorization", bearer(user)))
      .andExpect(jsonPath("$.items[*].title", contains("List 2", "List 3")));
    mockMvc.perform(get("/account/playlists?offset=4&limit=2&orderBy=title_asc").header("Authorization", bearer(user)))
      .andExpect(jsonPath("$.items[*].title", contains("List 4", "List 5")))
      .andExpect(jsonPath("$.offset").value(4))
      .andExpect(jsonPath("$.limit").value(2));
  }

  @Test
  void invalidPaging_is400() throws Exception {
    mockMvc.perform(get("/playlists?limit=101")).andExpect(status().isBadRequest());
    mockMvc.perform(get("/playlists?limit=0")).andExpect(status().isBadRequest());
    mockMvc.perform(get("/playlists?offset=-1")).andExpect(status().isBadRequest());
    mockMvc.perform(get("/playlists?orderBy=random")).andExpect(status().isBadRequest());
  }

  @Test
  void publicListing_showsEveryUsersNonEmptyPlaylists_filterableByOwner() throws Exception {
    User alice = newUser();
    User bob = newUser();
    UUID a = newScore(alice.getId(), "A");
    createPlaylist(alice, "Full");
    add(alice, "full", a);
    createPlaylist(alice, "Empty");
    add(bob, "favorites", a);

    mockMvc.perform(get("/playlists?owner=" + alice.getName()))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.total").value(1))
      .andExpect(jsonPath("$.items[0].slug").value("full"));
    mockMvc.perform(get("/playlists?owner=" + bob.getName()))
      .andExpect(jsonPath("$.items[0].slug").value("favorites"))
      .andExpect(jsonPath("$.items[0].owner.name").value(bob.getName()));
  }

  @Test
  void membership_listsFavoritesFirst_evenBeforeItExists() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    createPlaylist(user, "Mix");
    add(user, "mix", a);

    mockMvc.perform(get("/account/playlist/containing/" + a).header("Authorization", bearer(user)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[*].slug", contains("favorites", "mix")))
      .andExpect(jsonPath("$[0].contains").value(false))
      .andExpect(jsonPath("$[1].contains").value(true))
      .andExpect(jsonPath("$[1].itemCount").value(1));
  }

  // --- limits and cascades -----------------------------------------------------------------------------------

  @Test
  void playlistCount_isLimited() throws Exception {
    User user = newUser();
    for (int i = 0; i < PlaylistService.MAX_PLAYLISTS; i++) {
      jdbc.update("INSERT INTO pianoml.playlist (id, owner_id, title, slug, is_default) VALUES (?, ?, ?, ?, false)",
        UUID.randomUUID(), user.getId(), "P" + i, "p" + i);
    }
    createPlaylist(user, "One too many").andExpect(status().isUnprocessableContent());
  }

  @Test
  void deletingAScore_removesItsItems_andDeletingAUser_removesTheirPlaylists() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    UUID b = newScore(user.getId(), "B");
    add(user, "favorites", a);
    add(user, "favorites", b);

    jdbc.update("DELETE FROM pianoml.score WHERE id = ?", a);
    assertThat(count("SELECT COUNT(*) FROM pianoml.playlist_item WHERE score_id = ?", a)).isZero();

    jdbc.update("DELETE FROM pianoml.score WHERE id = ?", b);
    jdbc.update("DELETE FROM pianoml.\"user\" WHERE id = ?", user.getId());
    assertThat(count("SELECT COUNT(*) FROM pianoml.playlist WHERE owner_id = ?", user.getId())).isZero();
  }

  @Test
  void deletingAPlaylist_keepsItsScores() throws Exception {
    User user = newUser();
    UUID a = newScore(user.getId(), "A");
    createPlaylist(user, "Mix");
    add(user, "mix", a);
    mockMvc.perform(delete("/account/playlist/mix").header("Authorization", bearer(user)))
      .andExpect(status().isNoContent());
    detail(user, "mix").andExpect(status().isNotFound());
    assertThat(count("SELECT COUNT(*) FROM pianoml.score WHERE id = ?", a)).isEqualTo(1);
    assertThat(count("SELECT COUNT(*) FROM pianoml.playlist_item WHERE score_id = ?", a)).isZero();
  }
}
