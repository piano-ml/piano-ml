package org.pianoml.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.pianoml.backend.model.YoutubeVideoApiInfo;

import java.util.UUID;

@Entity
@Table(
    name = "youtube_rank",
    schema = "pianoml",
    uniqueConstraints = @UniqueConstraint(name = "uq_youtube_rank_score_video", columnNames = {"score_id", "video_id"})
)
@Data
@NoArgsConstructor
public class YoutubeRank {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "score_id", nullable = false)
    private UUID scoreId;

    @Column(name = "video_id", nullable = false, length = 255)
    private String videoId;

    @Column(name = "rank", nullable = false)
    private int rank = 0;

    @Column(name = "views", nullable = false)
    private int views = 0;

    @Column(name = "reports", nullable = false)
    private int reports = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "youtube_video_api_info", columnDefinition = "jsonb")
    private YoutubeVideoApiInfo youtubeVideoApiInfo;

    public YoutubeRank(UUID scoreId, String videoId) {
        this.scoreId = scoreId;
        this.videoId = videoId;
    }

    public YoutubeRank(UUID scoreId, String videoId, YoutubeVideoApiInfo youtubeVideoApiInfo) {
        this.scoreId = scoreId;
        this.videoId = videoId;
        this.youtubeVideoApiInfo = youtubeVideoApiInfo;
    }
}

