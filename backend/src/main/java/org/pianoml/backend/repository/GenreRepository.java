package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Genre;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GenreRepository extends CrudRepository<Genre, UUID> {

  List<Genre> findByNameContainingIgnoreCase(String name);

  Optional<Genre> findById(UUID id);

  @Query("SELECT g.id, g.mbid, g.name, COUNT(s), g.description " +
         "FROM Genre g LEFT JOIN Score s ON s.genre = g AND (s.deleted = false OR s.deleted IS NULL) " +
         "GROUP BY g.id, g.mbid, g.name ORDER BY g.name ASC")
  List<Object[]> findAllWithScoreCountRaw();

  @Query("SELECT g.id, g.mbid, g.name, COUNT(s), g.description " +
         "FROM Genre g LEFT JOIN Score s ON s.genre = g AND (s.deleted = false OR s.deleted IS NULL) " +
         "WHERE g.mbid = :id GROUP BY g.id, g.mbid, g.name")
  Optional<Object[]> findByIdWithScoreCountRaw(UUID id);

  // batch lookup by auto-generated id
  List<Genre> findByIdIn(Collection<UUID> ids);

  // batch lookup by MBID (used to map genre_tree.genre_id -> genre.name)
  List<Genre> findByMbidIn(Collection<UUID> mbids);

  Optional<Genre> findByMbid(UUID mbid);

}
