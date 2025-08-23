package org.pianoml.backend.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.*;
import org.pianoml.backend.entity.Score;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public class ScoreRepositoryCustom implements IScoreRepositoryCustom {

  @PersistenceContext
  private EntityManager em;

  public List<Score> findByCriterias(String keyword, String ownerId, String genreId, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit) {
    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Score> cq = cb.createQuery(Score.class);
    Root<Score> root = cq.from(Score.class);

    Predicate predicate = cb.conjunction();
    if (keyword != null && !keyword.isEmpty()) {

      predicate = cb.and(predicate, cb.like(cb.lower(root.get("title")), "%" + keyword.toLowerCase() + "%"));
    }
    if (ownerId != null && !ownerId.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("owner").get("id"), UUID.fromString(ownerId)));
    }

    if (genreId != null && !genreId.isEmpty()) {
      predicate = cb.and(predicate, cb.equal(root.get("genreId"), genreId));
    }
    if (gradeStart != null) {
      predicate = cb.and(predicate, cb.greaterThanOrEqualTo(root.get("grade"), gradeStart));
    }
    if (gradeEnd != null) {
      predicate = cb.and(predicate, cb.lessThanOrEqualTo(root.get("grade"), gradeEnd));
    }

    cq.where(predicate);

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
