package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface IScoreRepositoryCustom {
<<<<<<< Updated upstream
  List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, Boolean etude, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit, User user);
=======
>>>>>>> Stashed changes

  List<Score> findWithSomeCriterias(String keyword, String ownerId, String genreId, String artist, Boolean etude, Integer gradeStart, Integer gradeEnd, String tempo, Integer offset, Integer limit, java.util.List<Integer> tracks, User user);

  List<Object[]> countScoresGroupedByAuthor(User user, Integer offset, Integer limit, java.util.List<Integer> tracks);

  List<Object[]> countScoresGroupedByGenre(User user, Integer offset, Integer limit, java.util.List<Integer> tracks, java.util.List<UUID> genreFilter);

  Long[] countPublicAndCopyrighted();
}
