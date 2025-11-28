package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface IScoreRepositoryCustom {
  List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, Boolean etude, Integer gradeStart, Integer gradeEnd, String tempo, Integer offset, Integer limit, User user);

  List<Object[]> countScoresGroupedByAuthor(User user, Integer offset, Integer limit);

  /**
   * Count visible scores split between public-domain and copyrighted based on visibility rules.
   * Returns an array of two Longs: [publicDomainCount, copyrightedCount]
   */
  Long[] countPublicAndCopyrighted();
}
