package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Score;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ScoreRepository extends CrudRepository<Score, UUID> {
}
