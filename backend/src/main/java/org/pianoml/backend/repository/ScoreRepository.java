package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ScoreRepository extends CrudRepository<Score, UUID> {

  Integer countScoreByMbidAndOwner(UUID mbid, User owner);

  Optional<Score> findScoreByMbidAndOwnerAndVersion(UUID mbid, User owner, Integer version);

  List<Score> findByImmutableSlugStartingWith(String slugPrefix);

  Optional<Score> findByImmutableSlug(String immutableSlug);
}
