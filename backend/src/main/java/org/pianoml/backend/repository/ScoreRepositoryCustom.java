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
import org.springframework.stereotype.Repository;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Repository
public class ScoreRepositoryCustom implements IScoreRepositoryCustom {

  @PersistenceContext
  private EntityManager em;

  public List<Score> findByCriterias(String keyword, String ownerId, String genreId, String artist, Boolean etude, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit, User user) {
    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Score> cq = cb.createQuery(Score.class);
    Root<Score> root = cq.from(Score.class);

    Predicate predicate = cb.conjunction();

    // Exclude deleted scores
    //predicate = cb.and(predicate, cb.or(cb.isNull(root.get("deleted")), cb.isFalse(root.get("deleted"))));

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
      predicate = cb.and(predicate, cb.like(cb.lower(root.get("author").get("name")), "%" + artist.toLowerCase() + "%"));
    }

    if (etude != null) {
      predicate = cb.and(predicate, cb.equal(root.get("etude"), etude));
    }

    // Visibility rules:
    // - unauthenticated users (user == null) see only publicDomain = true
    // - authenticated non-admin users see scores where owner = user OR publicDomain = true
    // - admin users see all scores (no extra restriction)
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
      query.setMaxResults(100); // Default limit if not specified
    }

    return query.getResultList();
  }
}
