package org.pianoml.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.mapper.ScoreMapper;
import org.pianoml.backend.repository.GenreRepository;
import org.pianoml.backend.repository.ScoreRepository;
import org.pianoml.backend.repository.UserPlayCountRepository;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScoreServicePdfPackTest {

    @Mock
    private PackService packService;

    @Mock
    private ScoreRepository scoreRepository;

    @Mock
    private UserPlayCountRepository userPlayCountRepository;

    @Mock
    private AuthorService authorService;

    @Mock
    private GenreRepository genreRepository;

    @Mock
    private ScoreMapper scoreMapper;

    private ScoreService scoreService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        scoreService = new ScoreService();
        // inject mocks via reflection-like setting since fields are private in original class
        try {
            java.lang.reflect.Field packServiceField = ScoreService.class.getDeclaredField("packService");
            packServiceField.setAccessible(true);
            packServiceField.set(scoreService, packService);

            java.lang.reflect.Field scoreRepositoryField = ScoreService.class.getDeclaredField("scoreRepository");
            scoreRepositoryField.setAccessible(true);
            scoreRepositoryField.set(scoreService, scoreRepository);

            java.lang.reflect.Field userPlayCountRepoField = ScoreService.class.getDeclaredField("userPlayCountRepository");
            userPlayCountRepoField.setAccessible(true);
            userPlayCountRepoField.set(scoreService, userPlayCountRepository);

            java.lang.reflect.Field authorServiceField = ScoreService.class.getDeclaredField("authorService");
            authorServiceField.setAccessible(true);
            authorServiceField.set(scoreService, authorService);

            java.lang.reflect.Field genreRepoField = ScoreService.class.getDeclaredField("genreRepository");
            genreRepoField.setAccessible(true);
            genreRepoField.set(scoreService, genreRepository);

            java.lang.reflect.Field scoreMapperField = ScoreService.class.getDeclaredField("scoreMapper");
            scoreMapperField.setAccessible(true);
            scoreMapperField.set(scoreService, scoreMapper);

            // set a dummy bucket name to avoid NullPointer on @Value field
            java.lang.reflect.Field bucketField = ScoreService.class.getDeclaredField("bucketName");
            bucketField.setAccessible(true);
            bucketField.set(scoreService, "test-bucket");

            // set a dummy s3Client to null (not used in pdf flow)
            java.lang.reflect.Field s3ClientField = ScoreService.class.getDeclaredField("s3Client");
            s3ClientField.setAccessible(true);
            s3ClientField.set(scoreService, null);

        } catch (NoSuchFieldException | IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void packAttachmentToScore_whenTypePdf_callsPackPDFWorkloadWithCorrectArguments() throws Exception {
        // Arrange
        Score score = new Score();
        score.setId(UUID.randomUUID());
        User owner = new User();
        owner.setId(UUID.randomUUID());
        score.setOwner(owner);
        score.setVersion(1);
        // fields used by PackScriptDto constructor
        score.setTitle("Test Title");
        Author author = new Author();
        author.setName("Test Author");
        score.setAuthor(author);
        score.setStudyTracks("1");

        byte[] pdfBytes = "dummy-pdf-content".getBytes();
        InputStream input = new ByteArrayInputStream(pdfBytes);

        // Act
        scoreService.packAttachmentToScore(score, "pdf", input, true);

        // Assert
        ArgumentCaptor<PackScriptDto> captor = ArgumentCaptor.forClass(PackScriptDto.class);
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(packService, times(1)).packPDFWorkload(captor.capture(), keyCaptor.capture());

        PackScriptDto passed = captor.getValue();
        String passedKey = keyCaptor.getValue();

        assertNotNull(passed);
        assertEquals(score.getId().toString(), passed.getId());
        assertEquals("pdf", passed.getType());
        assertEquals(Boolean.TRUE, passed.getMakeFingerings());

        // Verify that the InputStream contains the same bytes
        byte[] read = passed.getInputStream().readAllBytes();
        assertArrayEquals(pdfBytes, read);

        // Verify key structure
        assertTrue(passedKey.startsWith("scores/"));
        assertTrue(passedKey.contains(score.getOwner().getId().toString()));
        assertTrue(passedKey.contains(String.valueOf(score.getVersion())));
    }
}
