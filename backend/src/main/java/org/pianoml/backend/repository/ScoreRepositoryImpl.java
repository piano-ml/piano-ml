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

  public List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, Boolean etude, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit, User user) {
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
    cq.orderBy(cb.desc(root.get("uploadedAt")));

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
  public List<Object[]> countScoresGroupedByAuthor(Integer offset, Integer limit) {
    String jpql = "SELECT s.author, COUNT(s) FROM Score s WHERE (s.deleted = false OR s.deleted IS NULL) GROUP BY s.author ORDER BY s.author.sortName ASC, COUNT(s) DESC";
    TypedQuery<Object[]> query = em.createQuery(jpql, Object[].class);
    if (offset != null) query.setFirstResult(offset);
    if (limit != null) query.setMaxResults(limit);
    return query.getResultList();
  }
}
