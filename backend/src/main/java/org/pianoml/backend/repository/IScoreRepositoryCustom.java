package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface IScoreRepositoryCustom {
  List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, String artistSlug, String genreSlug, Boolean etude, Integer gradeStart, Integer gradeEnd, String tempo, String fullKey, String orderBy, Integer offset, Integer limit, User user, List<Integer> tracks);

  List<Object[]> countScoresGroupedByAuthor(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, String fullKey);

  List<Object[]> countScoresGroupedByGenre(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, java.util.List<UUID> genreFilter, String fullKey);

  Long[] countPublicAndCopyrighted();

  // Return distinct non-null fullKey values present in the DB
  List<String> findDistinctFullKeys();
}
