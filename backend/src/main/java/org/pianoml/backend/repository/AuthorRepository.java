package org.pianoml.backend.repository;

import jakarta.validation.constraints.NotNull;
import org.pianoml.backend.entity.Author;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuthorRepository extends CrudRepository<Author, UUID> {
  Optional<Author> findByMbid(@NotNull UUID mbid);

  @Query("SELECT a FROM Author a WHERE a.name ILIKE %:name%")
  Iterable<Author> searchByNameIlike(@Param("name") String name);
}
