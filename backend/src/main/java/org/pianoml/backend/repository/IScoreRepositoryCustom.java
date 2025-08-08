package org.pianoml.backend.repository;

import org.pianoml.backend.entity.Score;
import org.springframework.stereotype.Repository;

import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public interface IScoreRepositoryCustom {
  List<Score> findByCriterias(String keyword, String genreId, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit);

}
