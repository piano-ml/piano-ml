package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.entity.Score;
import org.pianoml.backend.repository.ScoreRepository;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SlugUtilsTest {

    @Test
    @DisplayName("Should create basic slug from author and title")
    void shouldCreateBasicSlug() {
        // Given
        Author author = new Author();
        author.setSortName("Mozart");

        Score score = new Score();
        score.setAuthor(author);
        score.setTitle("Sonata No. 1");
        score.setVersion(1);

        // When
        String result = SlugUtils.createSlug(score);

        // Then
        assertEquals("mozart-sonata-no-1", result);
    }

    @Test
    @DisplayName("Should handle accents in author and title")
    void shouldHandleAccents() {
        // Given
        Author author = new Author();
        author.setSortName("Frédéric Chopin");

        Score score = new Score();
        score.setAuthor(author);
        score.setTitle("Étude Op. 10 No. 1");
        score.setVersion(1);

        // When
        String result = SlugUtils.createSlug(score);

        // Then
        assertEquals("frederic-chopin-etude-op-10-no-1", result);
    }

    @Test
    @DisplayName("Should add version number for versions > 1")
    void shouldAddVersionNumber() {
        // Given
        Author author = new Author();
        author.setSortName("Bach");

        Score score = new Score();
        score.setAuthor(author);
        score.setTitle("Invention No. 1");
        score.setVersion(2);

        // When
        String result = SlugUtils.createSlug(score);

        // Then
        assertEquals("bach-invention-no-1-2", result);
    }

    @ParameterizedTest
    @MethodSource("accentTestCases")
    @DisplayName("Should properly remove accents from various characters")
    void shouldRemoveAccents(String input, String expected) {
        // Given
        Author author = new Author();
        author.setSortName(input);

        Score score = new Score();
        score.setAuthor(author);
        score.setTitle("Test");
        score.setVersion(1);

        // When
        String result = SlugUtils.createSlug(score);

        // Then
        assertTrue(result.startsWith(expected));
    }

    @ParameterizedTest
    @MethodSource("specialCharacterTestCases")
    @DisplayName("Should handle special characters correctly")
    void shouldHandleSpecialCharacters(String authorName, String title, String expectedSlug) {
        // Given
        Author author = new Author();
        author.setSortName(authorName);

        Score score = new Score();
        score.setAuthor(author);
        score.setTitle(title);
        score.setVersion(1);

        // When
        String result = SlugUtils.createSlug(score);

        // Then
        assertEquals(expectedSlug, result);
    }

    @Test
    @DisplayName("Should create unique slug when conflicts exist")
    void shouldCreateUniqueSlugWithConflicts() {
        // Given
        Author author = new Author();
        author.setSortName("Bach");

        Score score = new Score();
        score.setAuthor(author);
        score.setTitle("Invention");
        score.setVersion(1);

        ScoreRepository repository = mock(ScoreRepository.class);

        // Simuler des slugs existants
        Score existingScore1 = new Score();
        existingScore1.setImmutableSlug("bach-invention");
        Score existingScore2 = new Score();
        existingScore2.setImmutableSlug("bach-invention-1");

        List<Score> existingScores = List.of(existingScore1, existingScore2);
        when(repository.findByImmutableSlugStartingWith("bach-invention"))
            .thenReturn(existingScores);

        // When
        SlugUtils.createUniqueSlug(score, repository);

        // Then
        assertEquals("bach-invention-2", score.getImmutableSlug());
    }

    @Test
    @DisplayName("Should return base slug when no conflicts exist")
    void shouldReturnBaseSlugWithoutConflicts() {
        // Given
        Author author = new Author();
        author.setSortName("Debussy");

        Score score = new Score();
        score.setAuthor(author);
        score.setTitle("Clair de Lune");
        score.setVersion(1);

        ScoreRepository repository = mock(ScoreRepository.class);
        when(repository.findByImmutableSlugStartingWith("debussy-clair-de-lune"))
            .thenReturn(new ArrayList<>());

        // When
        SlugUtils.createUniqueSlug(score, repository);

        // Then
        assertEquals("debussy-clair-de-lune", score.getImmutableSlug());
    }

    @Test
    @DisplayName("Should throw exception when score is null")
    void shouldThrowExceptionWhenScoreIsNull() {
        assertThrows(IllegalArgumentException.class, () -> {
            SlugUtils.createSlug(null);
        });
    }

    @Test
    @DisplayName("Should throw exception when author is null")
    void shouldThrowExceptionWhenAuthorIsNull() {
        Score score = new Score();
        score.setTitle("Test Title");

        assertThrows(IllegalArgumentException.class, () -> {
            SlugUtils.createSlug(score);
        });
    }

    @Test
    @DisplayName("Should throw exception when title is null")
    void shouldThrowExceptionWhenTitleIsNull() {
        Author author = new Author();
        author.setSortName("Test Author");

        Score score = new Score();
        score.setAuthor(author);

        assertThrows(IllegalArgumentException.class, () -> {
            SlugUtils.createSlug(score);
        });
    }

    private static Stream<Arguments> accentTestCases() {
        return Stream.of(
            Arguments.of("François", "francois"),
            Arguments.of("José", "jose"),
            Arguments.of("Müller", "muller"),
            Arguments.of("Dvořák", "dvorak"),
            Arguments.of("Rão", "rao"),
            Arguments.of("Çelik", "celik")
        );
    }

    private static Stream<Arguments> specialCharacterTestCases() {
        return Stream.of(
            Arguments.of("J.S. Bach", "Prelude & Fugue", "js-bach-prelude-fugue"),
            Arguments.of("Saint-Saëns", "Danse Macabre", "saint-saens-danse-macabre"),
            Arguments.of("Villa-Lobos", "Bachianas Brasileiras No. 5", "villa-lobos-bachianas-brasileiras-no-5"),
            Arguments.of("Albéniz", "Asturias (Leyenda)", "albeniz-asturias-leyenda"),
            Arguments.of("Rachmaninoff", "Piano Concerto #2", "rachmaninoff-piano-concerto-2"),
            Arguments.of("Satie", "Gymnopédie No.1", "satie-gymnopedie-no-1")
        );
    }
}
