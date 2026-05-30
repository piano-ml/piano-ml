package org.pianoml.backend.repository;

import org.pianoml.backend.entity.YoutubeRank;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface YoutubeRankRepository extends CrudRepository<YoutubeRank, Long> {

    Optional<YoutubeRank> findByScoreIdAndVideoId(UUID scoreId, String videoId);

    @Transactional
    @Modifying
    @Query("UPDATE YoutubeRank y SET y.rank = y.rank + 1 WHERE y.scoreId = :scoreId AND y.videoId = :videoId")
    void incrementRank(@Param("scoreId") UUID scoreId, @Param("videoId") String videoId);

    @Transactional
    @Modifying
    @Query("UPDATE YoutubeRank y SET y.rank = y.rank - 1 WHERE y.scoreId = :scoreId AND y.videoId = :videoId")
    void decrementRank(@Param("scoreId") UUID scoreId, @Param("videoId") String videoId);

    @Transactional
    @Modifying
    @Query("UPDATE YoutubeRank y SET y.views = y.views + 1 WHERE y.scoreId = :scoreId AND y.videoId = :videoId")
    void incrementViews(@Param("scoreId") UUID scoreId, @Param("videoId") String videoId);

    @Transactional
    @Modifying
    @Query("UPDATE YoutubeRank y SET y.reports = y.reports + 1 WHERE y.scoreId = :scoreId AND y.videoId = :videoId")
    void incrementReports(@Param("scoreId") UUID scoreId, @Param("videoId") String videoId);
}

