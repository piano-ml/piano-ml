package org.pianoml.backend.service;

import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.mapper.ScoreMapper;
import org.pianoml.backend.model.ScoreApiInfo;
import org.pianoml.backend.repository.AuthorRepository;
import org.pianoml.backend.repository.GenreRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Service
public class ScoreService {

    @Autowired
    private ScoreRepository scoreRepository;

    @Autowired
    private AuthorRepository authorRepository;

    @Autowired
    private GenreRepository genreRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ScoreMapper scoreMapper;

    public ScoreApiInfo createScore(ScoreApiInfo scoreApiInfo, String userId) {
        Score score = scoreMapper.toScore(scoreApiInfo);

        Author author = authorRepository.findById(UUID.fromString(scoreApiInfo.getAuthorId()))
                .orElseThrow(() -> new RuntimeException("Author not found"));
        score.setAuthor(author);

        if (scoreApiInfo.getGenreId() != null) {
            Genre genre = genreRepository.findById(UUID.fromString(scoreApiInfo.getGenreId()))
                    .orElseThrow(() -> new RuntimeException("Genre not found"));
            score.setGenre(genre);
        }

        User user = userRepository.findById(UUID.fromString(userId))
                .orElseThrow(() -> new RuntimeException("User not found"));
        score.setUploadedBy(user);

        Score savedScore = scoreRepository.save(score);
        return scoreMapper.toScoreApiInfo(savedScore);
    }

    public Optional<ScoreApiInfo> getScore(UUID id) {
        return scoreRepository.findById(id)
                .map(scoreMapper::toScoreApiInfo);
    }

    public Optional<ScoreApiInfo> updateScore(UUID id, ScoreApiInfo scoreApiInfo) {
        return scoreRepository.findById(id)
                .map(score -> {
                    // Update score fields from scoreApiInfo
                    score.setTitle(scoreApiInfo.getTitle());
                    score.setVersion(scoreApiInfo.getVersion());
                    score.setYear(scoreApiInfo.getYear());
                    score.setTracksCount(scoreApiInfo.getTracksCount());
                    score.setHandSeparated(scoreApiInfo.getHandSeparated());
                    score.setHasLyrics(scoreApiInfo.getHasLyrics());
                    score.setMeasures(scoreApiInfo.getMeasures());
                    score.setDuration(scoreApiInfo.getDuration());
                    score.setGrade(scoreApiInfo.getGrade());
                    score.setHasMxml(scoreApiInfo.getHasMxml());
                    score.setHasPdf(scoreApiInfo.getHasPdf());
                    score.setImage(scoreApiInfo.getImage() != null ? scoreApiInfo.getImage().toString() : null);

                    Score updatedScore = scoreRepository.save(score);
                    return scoreMapper.toScoreApiInfo(updatedScore);
                });
    }

    public List<ScoreApiInfo> searchScores(String keyword, String genreId, Integer gradeStart, Integer gradeEnd, Integer offset, Integer limit) {
        // Basic search implementation
        return StreamSupport.stream(scoreRepository.findAll().spliterator(), false)
                .filter(score -> keyword == null || score.getTitle().toLowerCase().contains(keyword.toLowerCase()))
                .filter(score -> genreId == null || score.getGenre() == null || score.getGenre().getId().toString().equals(genreId))
                .filter(score -> gradeStart == null || score.getGrade() >= gradeStart)
                .filter(score -> gradeEnd == null || score.getGrade() <= gradeEnd)
                .skip(offset != null ? offset : 0)
                .limit(limit != null ? limit : 10)
                .map(scoreMapper::toScoreApiInfo)
                .collect(Collectors.toList());
    }
}
