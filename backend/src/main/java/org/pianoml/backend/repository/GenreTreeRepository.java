package org.pianoml.backend.repository;

import org.pianoml.backend.entity.GenreTree;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GenreTreeRepository extends CrudRepository<GenreTree, UUID> {
  List<GenreTree> findAll();
}

