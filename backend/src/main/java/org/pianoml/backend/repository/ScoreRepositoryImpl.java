package org.pianoml.backend.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;

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
  public List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, String artistSlug, String genreSlug, Boolean etude, Integer gradeStart, Integer gradeEnd, String tempo, String fullKey, Integer offset, Integer limit, User user, List<Integer> tracks) {
    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Score> cq = cb.createQuery(Score.class);
    Root<Score> root = cq.from(Score.class);

    Predicate predicate = cb.conjunction();

    if (keyword != null && !keyword.isEmpty()) {
      predicate = cb.and(predicate, cb.like(cb.lower(root.get("title")), "%" + keyword.toLowerCase() + "%"));
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
        predicate = cb.and(predicate, cb.equal(root.get("genre").get("id"), UUID.fromString(genreId)));
      }
    }

    if (artist != null && !artist.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("author").get("id"), UUID.fromString(artist) ));
    }

    if (artistSlug != null && !artistSlug.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("author").get("slug"), artistSlug));
    }

    if (genreSlug != null && !genreSlug.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("genre").get("slug"), genreSlug));
    }

    if (etude != null) {
      predicate = cb.and(predicate, cb.equal(root.get("etude"), etude));
    }

    if (tempo != null && !tempo.isEmpty()) {
      if ("NONE".equalsIgnoreCase(tempo)) {
        predicate = cb.and(predicate, cb.isNull(root.get("tempo")));
      }
    }

    // New: filter by fullKey if provided. Special token NONE means full_key IS NULL.
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

    if (user == null) {
      predicate = cb.and(predicate, cb.isTrue(root.get("publicDomain")));
    } else {
      boolean isAdmin = user.getRoles() != null && Arrays.stream(user.getRoles().split(","))
        .anyMatch(role -> "ADMIN".equals(role.trim()));
      if (!isAdmin) {
        Predicate ownerIsUser = cb.equal(root.get("owner").get("id"), user.getId());
        Predicate isPublic = cb.isTrue(root.get("publicDomain"));
        predicate = cb.and(predicate, cb.or(ownerIsUser, isPublic));
      }
    }

    cq.where(predicate);
    if (artist != null && !artist.isEmpty()) {
      cq.orderBy(cb.desc(root.get("title")));
    } else {
      if (user == null) {
        cq.orderBy(cb.desc(root.get("playCount")));
      } else {
        cq.orderBy(cb.asc(root.get("playCount")), cb.desc(root.get("uploadedAt")));
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
  public List<Object[]> countScoresGroupedByAuthor(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, String fullKey) {
     // Build JPQL with the same visibility rules as findWithSomeCriterias
     boolean isAdmin = false;
     if (user != null) {
       isAdmin = user.getRoles() != null && Arrays.stream(user.getRoles().split(","))
         .anyMatch(role -> "ADMIN".equals(role.trim()));
     }

     StringBuilder jpql = new StringBuilder("SELECT s.author, COUNT(s) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL)");

     if (user == null) {
       jpql.append(" AND s.publicDomain = true");
     } else if (!isAdmin) {
       jpql.append(" AND (s.publicDomain = true OR s.owner.id = :userId)");
     }

     // Add tracks filter when provided: only include scores whose tracksCount is in the provided list
     if (tracks != null && !tracks.isEmpty()) {
       jpql.append(" AND s.tracksCount IN :tracksList");
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
     if (fullKey != null && !fullKey.isEmpty() && !"NONE".equalsIgnoreCase(fullKey)) {
       query.setParameter("fullKey", fullKey);
     }
     if (offset != null) query.setFirstResult(offset);
     if (limit != null) query.setMaxResults(limit);
     return query.getResultList();
   }

  @Override
  public List<Object[]> countScoresGroupedByGenre(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, java.util.List<UUID> genreFilter, String fullKey) {
    // Build JPQL with the same visibility rules as findWithSomeCriterias
    boolean isAdmin = false;
    if (user != null) {
      isAdmin = user.getRoles() != null && Arrays.stream(user.getRoles().split(","))
        .anyMatch(role -> "ADMIN".equals(role.trim()));
    }

    // First: Get count of scores with NULL genre (GROUP BY doesn't handle NULL correctly in JPA)
    StringBuilder nullJpql = new StringBuilder("SELECT COUNT(s) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL) AND s.genre IS NULL");
    if (user == null) {
      nullJpql.append(" AND s.publicDomain = true");
    } else if (!isAdmin) {
      nullJpql.append(" AND (s.publicDomain = true OR s.owner.id = :userId)");
    }
    nullJpql.append(" AND s.hasFiles = true");
    if (tracks != null && !tracks.isEmpty()) {
      nullJpql.append(" AND s.tracksCount IN :tracksList");
    }
    if (fullKey != null && !fullKey.isEmpty()) {
      if ("NONE".equalsIgnoreCase(fullKey)) {
        nullJpql.append(" AND s.fullKey IS NULL");
      } else {
        nullJpql.append(" AND s.fullKey = :fullKey");
      }
    }

    TypedQuery<Long> nullQuery = em.createQuery(nullJpql.toString(), Long.class);
    if (user != null && !isAdmin) {
      nullQuery.setParameter("userId", user.getId());
    }
    if (tracks != null && !tracks.isEmpty()) {
      nullQuery.setParameter("tracksList", tracks);
    }
    if (fullKey != null && !fullKey.isEmpty() && !"NONE".equalsIgnoreCase(fullKey)) {
      nullQuery.setParameter("fullKey", fullKey);
    }
    Long nullGenreCount = nullQuery.getSingleResult();

    // Second: Get counts for scores WITH a genre (GROUP BY works fine for non-NULL)
    StringBuilder jpql = new StringBuilder("SELECT s.genre, COUNT(s) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL) AND s.genre IS NOT NULL");

    if (user == null) {
      jpql.append(" AND s.publicDomain = true");
    } else if (!isAdmin) {
      jpql.append(" AND (s.publicDomain = true OR s.owner.id = :userId)");
    }

    jpql.append(" AND s.hasFiles = true");

    if (tracks != null && !tracks.isEmpty()) {
      jpql.append(" AND s.tracksCount IN :tracksList");
    }

    if (genreFilter != null && !genreFilter.isEmpty()) {
      jpql.append(" AND s.genre.id IN :genreList");
    }

    if (fullKey != null && !fullKey.isEmpty()) {
      if ("NONE".equalsIgnoreCase(fullKey)) {
        jpql.append(" AND s.fullKey IS NULL");
      } else {
        jpql.append(" AND s.fullKey = :fullKey");
      }
    }

    jpql.append(" GROUP BY s.genre ORDER BY COUNT(s) DESC");

    TypedQuery<Object[]> query = em.createQuery(jpql.toString(), Object[].class);
    if (user != null && !isAdmin) {
      query.setParameter("userId", user.getId());
    }
    if (tracks != null && !tracks.isEmpty()) {
      query.setParameter("tracksList", tracks);
    }
    if (genreFilter != null && !genreFilter.isEmpty()) {
      query.setParameter("genreList", genreFilter);
    }
    if (fullKey != null && !fullKey.isEmpty() && !"NONE".equalsIgnoreCase(fullKey)) {
      query.setParameter("fullKey", fullKey);
    }

    List<Object[]> results = query.getResultList();

    // Add NULL genre entry if there are scores without genre
    if (nullGenreCount > 0) {
      // Check if we should include NULL genre based on genreFilter
      boolean includeNull = genreFilter == null || genreFilter.isEmpty();
      if (includeNull) {
        results.add(new Object[]{null, nullGenreCount});
      }
    }

    // Apply pagination AFTER combining results (since we can't paginate two separate queries correctly)
    if (offset != null || limit != null) {
      int start = offset != null ? offset : 0;
      int end = limit != null ? Math.min(start + limit, results.size()) : results.size();
      if (start < results.size()) {
        results = results.subList(start, end);
      } else {
        results = List.of();
      }
    }

    return results;
  }

  @Override
  public Long[] countPublicAndCopyrighted() {
    // For stats endpoint we return global counts visible to the public. Do not filter by user or admin.
    String jpql = "SELECT SUM(CASE WHEN s.publicDomain = true THEN 1 ELSE 0 END), SUM(CASE WHEN s.publicDomain = false THEN 1 ELSE 0 END) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL)";
    TypedQuery<Object[]> query = em.createQuery(jpql, Object[].class);
    Object[] result = query.getSingleResult();
    long publicDomainCount = result[0] != null ? ((Number) result[0]).longValue() : 0L;
    long copyrightedCount = result[1] != null ? ((Number) result[1]).longValue() : 0L;
    return new Long[]{publicDomainCount, copyrightedCount};
  }

  @Override
  public List<String> findDistinctFullKeys() {
    String jpql = "SELECT DISTINCT s.fullKey FROM Score s WHERE s.fullKey IS NOT NULL ORDER BY s.fullKey ASC";
    TypedQuery<String> query = em.createQuery(jpql, String.class);
    return query.getResultList();
  }
}
