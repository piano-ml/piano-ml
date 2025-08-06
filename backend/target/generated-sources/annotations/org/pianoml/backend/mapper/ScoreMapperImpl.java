package org.pianoml.backend.mapper;

import java.util.UUID;
import javax.annotation.processing.Generated;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.ScoreApiInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2025-08-06T17:29:58+0200",
    comments = "version: 1.5.5.Final, compiler: javac, environment: Java 17.0.9 (JetBrains s.r.o.)"
)
@Component
public class ScoreMapperImpl implements ScoreMapper {

    @Autowired
    private UriMapper uriMapper;

    @Override
    public ScoreApiInfo toScoreApiInfo(Score score) {
        if ( score == null ) {
            return null;
        }

        ScoreApiInfo scoreApiInfo = new ScoreApiInfo();

        scoreApiInfo.setAuthor( scoreAuthorName( score ) );
        UUID id = scoreAuthorId( score );
        if ( id != null ) {
            scoreApiInfo.setAuthorId( id.toString() );
        }
        scoreApiInfo.setGenre( scoreGenreName( score ) );
        UUID id1 = scoreGenreId( score );
        if ( id1 != null ) {
            scoreApiInfo.setGenreId( id1.toString() );
        }
        UUID id2 = scoreUploadedById( score );
        if ( id2 != null ) {
            scoreApiInfo.setUploadedById( id2.toString() );
        }
        if ( score.getId() != null ) {
            scoreApiInfo.setId( score.getId().toString() );
        }
        scoreApiInfo.setTitle( score.getTitle() );
        scoreApiInfo.setVersion( score.getVersion() );
        scoreApiInfo.setYear( score.getYear() );
        scoreApiInfo.setTracksCount( score.getTracksCount() );
        scoreApiInfo.setHandSeparated( score.getHandSeparated() );
        scoreApiInfo.setHasLyrics( score.getHasLyrics() );
        scoreApiInfo.setMeasures( score.getMeasures() );
        scoreApiInfo.setDuration( score.getDuration() );
        scoreApiInfo.setGrade( score.getGrade() );
        scoreApiInfo.setUploadedAt( score.getUploadedAt() );
        scoreApiInfo.setUpdatedAt( score.getUpdatedAt() );
        scoreApiInfo.setHasMxml( score.getHasMxml() );
        scoreApiInfo.setHasPdf( score.getHasPdf() );
        scoreApiInfo.setImage( uriMapper.asUri( score.getImage() ) );

        return scoreApiInfo;
    }

    @Override
    public Score toScore(ScoreApiInfo scoreApiInfo) {
        if ( scoreApiInfo == null ) {
            return null;
        }

        Score score = new Score();

        score.setTitle( scoreApiInfo.getTitle() );
        score.setVersion( scoreApiInfo.getVersion() );
        score.setYear( scoreApiInfo.getYear() );
        score.setTracksCount( scoreApiInfo.getTracksCount() );
        score.setHandSeparated( scoreApiInfo.getHandSeparated() );
        score.setHasLyrics( scoreApiInfo.getHasLyrics() );
        score.setMeasures( scoreApiInfo.getMeasures() );
        score.setDuration( scoreApiInfo.getDuration() );
        score.setGrade( scoreApiInfo.getGrade() );
        score.setUploadedAt( scoreApiInfo.getUploadedAt() );
        score.setUpdatedAt( scoreApiInfo.getUpdatedAt() );
        score.setHasMxml( scoreApiInfo.getHasMxml() );
        score.setHasPdf( scoreApiInfo.getHasPdf() );
        score.setImage( uriMapper.asString( scoreApiInfo.getImage() ) );

        return score;
    }

    private String scoreAuthorName(Score score) {
        if ( score == null ) {
            return null;
        }
        Author author = score.getAuthor();
        if ( author == null ) {
            return null;
        }
        String name = author.getName();
        if ( name == null ) {
            return null;
        }
        return name;
    }

    private UUID scoreAuthorId(Score score) {
        if ( score == null ) {
            return null;
        }
        Author author = score.getAuthor();
        if ( author == null ) {
            return null;
        }
        UUID id = author.getId();
        if ( id == null ) {
            return null;
        }
        return id;
    }

    private String scoreGenreName(Score score) {
        if ( score == null ) {
            return null;
        }
        Genre genre = score.getGenre();
        if ( genre == null ) {
            return null;
        }
        String name = genre.getName();
        if ( name == null ) {
            return null;
        }
        return name;
    }

    private UUID scoreGenreId(Score score) {
        if ( score == null ) {
            return null;
        }
        Genre genre = score.getGenre();
        if ( genre == null ) {
            return null;
        }
        UUID id = genre.getId();
        if ( id == null ) {
            return null;
        }
        return id;
    }

    private UUID scoreUploadedById(Score score) {
        if ( score == null ) {
            return null;
        }
        User uploadedBy = score.getUploadedBy();
        if ( uploadedBy == null ) {
            return null;
        }
        UUID id = uploadedBy.getId();
        if ( id == null ) {
            return null;
        }
        return id;
    }
}
