package org.pianoml.backend.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.GenreTree;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

// Implementation class for the custom repository methods.
// Do NOT annotate with @Repository: Spring Data will wire this implementation into the generated
// repository proxy (the primary `ScoreRepository` bean). If annotated, Spring will create a second bean
// that also implements IScoreRepositoryCustom and injection by type becomes ambiguous.
public class ScoreRepositoryImpl implements IScoreRepositoryCustom {

  @PersistenceContext
  private EntityManager em;

  // Updated signature with fullKey parameter
  public List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, String artistSlug, String genreSlug, Boolean etude, Integer gradeStart, Integer gradeEnd, String tempo, String fullKey, String orderBy, Integer offset, Integer limit, User user, List<Integer> tracks) {
    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Score> cq = cb.createQuery(Score.class);
    Root<Score> root = cq.from(Score.class);

    Predicate predicate = cb.conjunction();

    if (keyword != null && !keyword.isEmpty()) {
      String pattern = "%" + keyword.toLowerCase() + "%";
      Predicate titleMatch = cb.like(cb.lower(root.get("title")), pattern);
      Predicate authorMatch = cb.like(cb.lower(root.get("author").get("name")), pattern);
      predicate = cb.and(predicate, cb.or(titleMatch, authorMatch));
    }
    if (ownerId != null && !ownerId.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("owner").get("id"), UUID.fromString(ownerId)));
    } else {
      predicate = cb.and(predicate, cb.isTrue(root.get("hasFiles")));
    }

    if (genreId != null && !genreId.isEmpty()) {
      if (genreId.equals("NONE")) {
        predicate = cb.and(predicate, cb.isNull(root.get("genre")));
      } else {
        UUID genreUUID = UUID.fromString(genreId);
        // Match scores whose genre IS the requested genre,
        // OR whose genre is a direct child of it in genre_tree (parent_id = genreId).
        Predicate directMatch = cb.equal(root.get("genre").get("id"), genreUUID);
        Subquery<UUID> childSub = cq.subquery(UUID.class);
        Root<GenreTree> gt = childSub.from(GenreTree.class);
        childSub.select(gt.get("id"))
          .where(cb.equal(gt.get("parent").get("id"), genreUUID));
        Predicate childMatch = root.get("genre").get("id").in(childSub);
        predicate = cb.and(predicate, cb.or(directMatch, childMatch));
      }
    }

    if (artist != null && !artist.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("author").get("id"), UUID.fromString(artist) ));
    }

    if (artistSlug != null && !artistSlug.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("author").get("slug"), artistSlug));
    }

    if (genreSlug != null && !genreSlug.isEmpty()) {
      // Match scores whose genre slug matches directly (the genre IS the requested one),
      // OR whose genre is a direct child in genre_tree of the genre identified by that slug.
      Predicate directSlugMatch = cb.equal(root.get("genre").get("slug"), genreSlug);

      // Inner subquery: resolve the UUID of the genre identified by the slug.
      //   SELECT g.id FROM Genre g WHERE g.slug = :genreSlug
      Subquery<UUID> parentIdSub = cq.subquery(UUID.class);
      Root<Genre> parentGenre = parentIdSub.from(Genre.class);
      parentIdSub.select(parentGenre.get("id"))
        .where(cb.equal(parentGenre.get("slug"), genreSlug));

      // Outer subquery: find all genre_tree entries whose parent.id is in the above set.
      //   SELECT gt.id FROM GenreTree gt WHERE gt.parent.id IN (parentIdSub)
      Subquery<UUID> childSlugSub = cq.subquery(UUID.class);
      Root<GenreTree> gtSlug = childSlugSub.from(GenreTree.class);
      childSlugSub.select(gtSlug.get("id"))
        .where(gtSlug.get("parent").get("id").in(parentIdSub));

      Predicate childSlugMatch = root.get("genre").get("id").in(childSlugSub);
      predicate = cb.and(predicate, cb.or(directSlugMatch, childSlugMatch));
    }

    if (etude != null) {
      predicate = cb.and(predicate, cb.equal(root.get("etude"), etude));
    }

    if (tempo != null && !tempo.isEmpty()) {
      if ("NONE".equalsIgnoreCase(tempo)) {
        predicate = cb.and(predicate, cb.isNull(root.get("tempo")));
      }
    }

    if (fullKey != null && !fullKey.isEmpty()) {
      if ("NONE".equalsIgnoreCase(fullKey)) {
        predicate = cb.and(predicate, cb.isNull(root.get("fullKey")));
      } else {
        predicate = cb.and(predicate, cb.equal(root.get("fullKey"), fullKey));
      }
    }

    if (tracks != null && !tracks.isEmpty()) {
      predicate = cb.and(predicate, root.get("tracksCount").in(tracks));
    }

/*    if (user == null) {
      predicate = cb.and(predicate, cb.isTrue(root.get("publicDomain")));
    } else {
      boolean isAdmin = user.getRoles() != null && Arrays.stream(user.getRoles().split(","))
        .anyMatch(role -> "ADMIN".equals(role.trim()));
      if (!isAdmin) {
        Predicate ownerIsUser = cb.equal(root.get("owner").get("id"), user.getId());
        Predicate isPublic = cb.isTrue(root.get("publicDomain"));
        predicate = cb.and(predicate, cb.or(ownerIsUser, isPublic));
      }
    }*/

    cq.where(predicate);
    if (orderBy==null) {
      if (artist != null && !artist.isEmpty()) {
        cq.orderBy(cb.desc(root.get("title")));
      } else {
        if (user == null) {
          cq.orderBy(cb.desc(root.get("playCount")));
        } else {
          cq.orderBy(cb.asc(root.get("playCount")), cb.desc(root.get("uploadedAt")));
        }
      }
    } else {
      switch (orderBy) {
        case "title_asc":
          cq.orderBy(cb.asc(root.get("title")));
          break;
        case "title_desc":
          cq.orderBy(cb.desc(root.get("title")));
          break;
        case "grade_asc":
          cq.orderBy(cb.asc(root.get("grade")));
          break;
        case "grade_desc":
          cq.orderBy(cb.desc(root.get("grade")));
          break;
        case "uploadedAt_asc":
          cq.orderBy(cb.asc(root.get("uploadedAt")));
          break;
        case "uploadedAt_desc":
          cq.orderBy(cb.desc(root.get("uploadedAt")));
          break;
        case "playCount_asc":
          cq.orderBy(cb.asc(root.get("playCount")));
          break;
        case "playCount_desc":
          cq.orderBy(cb.desc(root.get("playCount")));
          break;
        default:
          // Default ordering if unrecognized orderBy value
          cq.orderBy(cb.desc(root.get("playCount")));
          break;
      }
    }
    TypedQuery<Score> query = em.createQuery(cq);
    if (offset != null) query.setFirstResult(offset);
    if (limit != null) {
      query.setMaxResults(limit);
    } else {
      query.setMaxResults(200);
    }

    return query.getResultList();
  }

  @Override
  public List<Object[]> countScoresGroupedByAuthor(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, String fullKey, String slug) {
     // Build JPQL with the same visibility rules as findWithSomeCriterias
     boolean isAdmin = false;
     if (user != null) {
       isAdmin = user.getRoles() != null && Arrays.stream(user.getRoles().split(","))
         .anyMatch(role -> "ADMIN".equals(role.trim()));
     }

     StringBuilder jpql = new StringBuilder("SELECT s.author, COUNT(s), MAX(s.uploadedAt) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL)");

/*     if (user == null) {
       jpql.append(" AND s.publicDomain = true");
     } else if (!isAdmin) {
       jpql.append(" AND (s.publicDomain = true OR s.owner.id = :userId)");
     }*/

     // Add tracks filter when provided: only include scores whose tracksCount is in the provided list
     if (tracks != null && !tracks.isEmpty()) {
       jpql.append(" AND s.tracksCount IN :tracksList");
     }

     // Add slug filter when provided
     if (slug != null && !slug.isEmpty()) {
       jpql.append(" AND s.author.slug = :slug");
     }

     // Add fullKey filter when provided
     if (fullKey != null && !fullKey.isEmpty()) {
       if ("NONE".equalsIgnoreCase(fullKey)) {
         jpql.append(" AND s.fullKey IS NULL");
       } else {
         jpql.append(" AND s.fullKey = :fullKey");
       }
     }

     jpql.append(" GROUP BY s.author ORDER BY s.author.sortName ASC, COUNT(s) DESC");

     TypedQuery<Object[]> query = em.createQuery(jpql.toString(), Object[].class);
     if (user != null && !isAdmin) {
       query.setParameter("userId", user.getId());
     }
     if (tracks != null && !tracks.isEmpty()) {
       query.setParameter("tracksList", tracks);
     }
     if (slug != null && !slug.isEmpty()) {
       query.setParameter("slug", slug);
     }
     if (fullKey != null && !fullKey.isEmpty() && !"NONE".equalsIgnoreCase(fullKey)) {
       query.setParameter("fullKey", fullKey);
     }
     if (offset != null) query.setFirstResult(offset);
     if (limit != null) query.setMaxResults(limit);
     return query.getResultList();
   }

  @Override
  public List<Object[]> countScoresGroupedByGenre(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, java.util.List<UUID> genreFilter, String fullKey, String slug) {
    // Strategy: for each score with a genre, find its root genre via genre_tree.
    // COALESCE(gt.parent_id, gt.genre_id) gives the root genre id:
    //   - if the score's genre has a parent  → group under that parent (the root)
    //   - if the score's genre is already a root (no parent) → group under itself
    // This supports a single level of depth (root → children).
    // The result rows are: [Genre entity (root), count, maxUploadedAt]

    // Use a CTE to resolve the root genre id for every score in a single pass:
    //   - score.genre_id IS NULL                      → root_id = NULL  (no genre)
    //   - genre_id absent from genre_tree             → root_id = score.genre_id  (its own genre)
    //   - genre_id in genre_tree, no parent (root)    → root_id = gt.genre_id
    //   - genre_id in genre_tree, has parent (child)  → root_id = gt.parent_id
    // Then LEFT JOIN genre on root_id so NULL root_id yields a NULL genre row.
    StringBuilder sql = new StringBuilder(
      "WITH resolved AS ( " +
      "  SELECT s.id AS score_id, s.uploaded_at, " +
      "         COALESCE(gt.parent_id, gt.genre_id, s.genre_id) AS root_id " +
      "  FROM pianoml.score s " +
      "  LEFT JOIN pianoml.genre_tree gt ON gt.genre_id = s.genre_id " +
      "  WHERE (s.deleted = false OR s.deleted IS NULL) AND s.has_files = true"
    );

    if (tracks != null && !tracks.isEmpty()) {
      sql.append(" AND s.tracks_count IN :tracksList");
    }
    if (fullKey != null && !fullKey.isEmpty()) {
      if ("NONE".equalsIgnoreCase(fullKey)) {
        sql.append(" AND s.full_key IS NULL");
      } else {
        sql.append(" AND s.full_key = :fullKey");
      }
    }

    sql.append(
      ") " +
      "SELECT g.id, g.mbid, g.name, g.slug, COUNT(r.score_id), MAX(r.uploaded_at) " +
      "FROM resolved r " +
      "LEFT JOIN pianoml.genre g ON g.id = r.root_id " +
      "WHERE 1=1"
    );

    if (genreFilter != null && !genreFilter.isEmpty()) {
      sql.append(" AND r.root_id IN :genreList");
    }
    if (slug != null && !slug.isEmpty()) {
      sql.append(" AND g.slug = :slug");
    }

    sql.append(" GROUP BY g.id, g.mbid, g.name, g.slug ORDER BY COUNT(r.score_id) DESC");

    jakarta.persistence.Query query = em.createNativeQuery(sql.toString());

    if (tracks != null && !tracks.isEmpty()) {
      query.setParameter("tracksList", tracks);
    }
    if (genreFilter != null && !genreFilter.isEmpty()) {
      query.setParameter("genreList", genreFilter);
    }
    if (slug != null && !slug.isEmpty()) {
      query.setParameter("slug", slug);
    }
    if (fullKey != null && !fullKey.isEmpty() && !"NONE".equalsIgnoreCase(fullKey)) {
      query.setParameter("fullKey", fullKey);
    }

    @SuppressWarnings("unchecked")
    List<Object[]> rawResults = query.getResultList();

    // Convert native rows [id(UUID), mbid(UUID), name, slug, count, maxUploadedAt]
    // to the expected format [Genre entity (or null), Long count, OffsetDateTime maxUploadedAt]
    List<UUID> rootIds = rawResults.stream()
      .filter(row -> row[0] != null)
      .map(row -> (UUID) row[0])
      .collect(java.util.stream.Collectors.toList());

    java.util.Map<UUID, org.pianoml.backend.entity.Genre> genreById = java.util.Collections.emptyMap();
    if (!rootIds.isEmpty()) {
      List<org.pianoml.backend.entity.Genre> genres = em.createQuery(
        "SELECT g FROM Genre g WHERE g.id IN :ids", org.pianoml.backend.entity.Genre.class)
        .setParameter("ids", rootIds)
        .getResultList();
      genreById = genres.stream().collect(
        java.util.stream.Collectors.toMap(org.pianoml.backend.entity.Genre::getId, g -> g));
    }

    List<Object[]> results = new java.util.ArrayList<>();
    for (Object[] row : rawResults) {
      UUID rootId = (UUID) row[0];
      long count = ((Number) row[4]).longValue();
      OffsetDateTime maxUploadedAt = null;
      if (row[5] != null) {
        Object ts = row[5];
        if (ts instanceof OffsetDateTime) {
          maxUploadedAt = (OffsetDateTime) ts;
        } else if (ts instanceof java.time.Instant) {
          maxUploadedAt = ((java.time.Instant) ts).atOffset(java.time.ZoneOffset.UTC);
        } else if (ts instanceof java.sql.Timestamp) {
          maxUploadedAt = ((java.sql.Timestamp) ts).toInstant().atOffset(java.time.ZoneOffset.UTC);
        }
      }
      results.add(new Object[]{genreById.get(rootId), count, maxUploadedAt});
    }

    // Apply pagination
    if (offset != null || limit != null) {
      int start = offset != null ? offset : 0;
      int end = limit != null ? Math.min(start + limit, results.size()) : results.size();
      results = start < results.size() ? results.subList(start, end) : List.of();
    }

    return results;
  }

  @Override
  public Long[] countPublicAndCopyrighted() {
    // Use two separate COUNT queries to avoid PostgreSQL "no unpinned buffers available"
    // that can occur with complex SUM(CASE WHEN ...) aggregations via Hibernate 6.
    String jpqlPublic = "SELECT COUNT(s) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL) AND s.publicDomain = true";
    String jpqlCopyrighted = "SELECT COUNT(s) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL) AND s.publicDomain = false";
    long publicDomainCount = em.createQuery(jpqlPublic, Long.class).getSingleResult();
    long copyrightedCount = em.createQuery(jpqlCopyrighted, Long.class).getSingleResult();
    return new Long[]{publicDomainCount, copyrightedCount};
  }

  @Override
  public List<String> findDistinctFullKeys() {
    // Use GROUP BY instead of DISTINCT to avoid PostgreSQL "no unpinned buffers available"
    // that can occur with SELECT DISTINCT ... ORDER BY via Hibernate 6.
    String jpql = "SELECT s.fullKey FROM Score s WHERE s.fullKey IS NOT NULL GROUP BY s.fullKey ORDER BY s.fullKey ASC";
    TypedQuery<String> query = em.createQuery(jpql, String.class);
    return query.getResultList();
  }
}
