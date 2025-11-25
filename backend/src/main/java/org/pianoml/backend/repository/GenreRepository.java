package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Genre;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GenreRepository extends CrudRepository<Genre, UUID> {

  List<Genre> findByNameContainingIgnoreCase(String name);

  Optional<Genre> findByMbid(UUID id);

  @Query("SELECT g.id, g.mbid, g.name, COUNT(s) " +
         "FROM Genre g LEFT JOIN Score s ON s.genre = g AND (s.deleted = false OR s.deleted IS NULL) " +
         "GROUP BY g.id, g.mbid, g.name ORDER BY g.name ASC")
  List<Object[]> findAllWithScoreCountRaw();

  @Query("SELECT g.id, g.mbid, g.name, COUNT(s) " +
         "FROM Genre g LEFT JOIN Score s ON s.genre = g AND (s.deleted = false OR s.deleted IS NULL) " +
         "WHERE g.mbid = :mbid GROUP BY g.id, g.mbid, g.name")
  Optional<Object[]> findByMbidWithScoreCountRaw(UUID mbid);

}
