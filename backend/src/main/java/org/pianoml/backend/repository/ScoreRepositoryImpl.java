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

  public List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, Boolean etude, Integer gradeStart, Integer gradeEnd, String tempo, Integer offset, Integer limit, User user) {
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
      predicate = cb.and(predicate, cb.equal(root.get("genreId"), genreId));
    }

    if (artist != null && !artist.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("author").get("id"), UUID.fromString(artist) ));
    }

    if (etude != null) {
      predicate = cb.and(predicate, cb.equal(root.get("etude"), etude));
    }

    // New: handle tempo parameter. If tempo == "NONE" then filter where tempo IS NULL in DB.
    if (tempo != null && !tempo.isEmpty()) {
      if ("NONE".equalsIgnoreCase(tempo)) {
        predicate = cb.and(predicate, cb.isNull(root.get("tempo")));
      }
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

    if (user == null) {
      cq.orderBy(cb.desc(root.get("playCount")));
    } else {
      cq.orderBy(cb.asc(root.get("playCount")), cb.desc(root.get("uploadedAt")));
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
  public List<Object[]> countScoresGroupedByAuthor(User user, Integer offset, Integer limit) {
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

    jpql.append(" GROUP BY s.author ORDER BY s.author.sortName ASC, COUNT(s) DESC");

    TypedQuery<Object[]> query = em.createQuery(jpql.toString(), Object[].class);
    if (user != null && !isAdmin) {
      query.setParameter("userId", user.getId());
    }
    if (offset != null) query.setFirstResult(offset);
    if (limit != null) query.setMaxResults(limit);
    return query.getResultList();
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
}
