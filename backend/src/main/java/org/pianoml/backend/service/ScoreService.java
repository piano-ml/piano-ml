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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.UUID;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@Service
public class ScoreService {

    @Autowired
    private S3Client s3Client;

    @Value("${aws.s3.bucket-name}")
    private String bucketName;

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

    public void addAttachmentToScore(String id, String type, java.io.InputStream inputStream) throws IOException {
        String key = "scores/" + id + ".zip";
        byte[] existingZipData = new byte[0];

        try {
            existingZipData = s3Client.getObject(GetObjectRequest.builder().bucket(bucketName).key(key).build()).readAllBytes();
        } catch (S3Exception e) {
            if (e.statusCode() != 404) {
                throw e;
            }
            // If not found, we'll create a new zip file.
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            // Copy existing entries
            if (existingZipData.length > 0) {
                try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(existingZipData))) {
                    ZipEntry entry;
                    while ((entry = zis.getNextEntry()) != null) {
                        if (!entry.getName().equals(id + "." + type)) {
                            zos.putNextEntry(new ZipEntry(entry.getName()));
                            zos.write(zis.readAllBytes());
                            zos.closeEntry();
                        }
                    }
                }
            }

            // Add new file
            ZipEntry newEntry = new ZipEntry(id + "." + type);
            zos.putNextEntry(newEntry);
            zos.write(inputStream.readAllBytes());
            zos.closeEntry();
        }

        s3Client.putObject(PutObjectRequest.builder().bucket(bucketName).key(key).build(),
                RequestBody.fromBytes(baos.toByteArray()));
    }

    public Optional<byte[]> getAttachmentFromScore(String id, String type) throws IOException {
        String key = "scores/" + id + ".zip";
        try {
            byte[] zipData = s3Client.getObject(GetObjectRequest.builder().bucket(bucketName).key(key).build()).readAllBytes();
            try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipData))) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    if (entry.getName().equals(id + "." + type)) {
                        return Optional.of(zis.readAllBytes());
                    }
                }
            }
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return Optional.empty();
            }
            throw e;
        }
        return Optional.empty();
    }
}
