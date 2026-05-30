package org.pianoml.backend.service;

import com.google.api.services.youtube.model.ResourceId;
import com.google.api.services.youtube.model.SearchListResponse;
import com.google.api.services.youtube.model.SearchResult;
import com.google.api.services.youtube.model.SearchResultSnippet;
import com.google.api.services.youtube.model.Thumbnail;
import com.google.api.services.youtube.model.ThumbnailDetails;
import com.google.api.client.util.DateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.YoutubeVideoApiInfo;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Unit tests for YoutubeService.
 *
 * The YouTube HTTP client is extracted into the protected {@code executeSearch} method,
 * allowing a Mockito spy to stub it without making real network calls.
 */
public class YoutubeServiceTest {

    private YoutubeService service;

    @BeforeEach
    void setup() {
        service = spy(new YoutubeService());
        // Inject a non-blank API key so the early-exit guard is bypassed
        ReflectionTestUtils.setField(service, "apiKey", "FAKE_API_KEY");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // searchVideos — API key guard
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void searchVideos_missingApiKey_returnsEmptyList() throws IOException {
        ReflectionTestUtils.setField(service, "apiKey", "");

        List<YoutubeVideoApiInfo> result = service.searchVideos("Moonlight Sonata", "Beethoven");

        assertThat(result).isEmpty();
        verify(service, never()).executeSearch(anyString());
    }

    @Test
    void searchVideos_nullApiKey_returnsEmptyList() throws IOException {
        ReflectionTestUtils.setField(service, "apiKey", null);

        List<YoutubeVideoApiInfo> result = service.searchVideos("Clair de Lune", "Debussy");

        assertThat(result).isEmpty();
        verify(service, never()).executeSearch(anyString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // searchVideos — null / empty results from YouTube
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void searchVideos_nullItemsInResponse_returnsEmptyList() throws IOException {
        SearchListResponse response = new SearchListResponse();
        response.setItems(null);
        doReturn(response).when(service).executeSearch(anyString());

        List<YoutubeVideoApiInfo> result = service.searchVideos("Title", "Composer");

        assertThat(result).isEmpty();
    }

    @Test
    void searchVideos_emptyItemsInResponse_returnsEmptyList() throws IOException {
        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of());
        doReturn(response).when(service).executeSearch(anyString());

        List<YoutubeVideoApiInfo> result = service.searchVideos("Title", "Composer");

        assertThat(result).isEmpty();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // searchVideos — happy path mapping
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void searchVideos_twoResults_mapsAllFields() throws IOException {
        long publishedMillis = 1_700_000_000_000L;

        SearchResult item1 = buildSearchResult(
                "vid001", "Moonlight Sonata Tutorial", "Great video", "PianoChannel",
                "https://img1.jpg", publishedMillis);

        SearchResult item2 = buildSearchResult(
                "vid002", "Beethoven Piano Lesson", "Another video", "ClassicPiano",
                "https://img2.jpg", 0L);

        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of(item1, item2));
        doReturn(response).when(service).executeSearch(anyString());

        List<YoutubeVideoApiInfo> result = service.searchVideos("Moonlight Sonata", "Beethoven");

        assertThat(result).hasSize(2);

        YoutubeVideoApiInfo first = result.get(0);
        assertThat(first.getVideoId()).isEqualTo("vid001");
        assertThat(first.getTitle()).isEqualTo("Moonlight Sonata Tutorial");
        assertThat(first.getDescription()).isEqualTo("Great video");
        assertThat(first.getChannelTitle()).isEqualTo("PianoChannel");
        assertThat(first.getThumbnailUrl()).isEqualTo("https://img1.jpg");
        assertThat(first.getPublishedAt()).isNotNull();
        assertThat(first.getPublishedAt())
                .isEqualTo(OffsetDateTime.ofInstant(
                        java.time.Instant.ofEpochMilli(publishedMillis), ZoneOffset.UTC));

        YoutubeVideoApiInfo second = result.get(1);
        assertThat(second.getVideoId()).isEqualTo("vid002");
        assertThat(second.getTitle()).isEqualTo("Beethoven Piano Lesson");
    }

    @Test
    void searchVideos_itemWithNoSnippet_returnsInfoWithNullFields() throws IOException {
        SearchResult item = new SearchResult();
        ResourceId resourceId = new ResourceId();
        resourceId.setVideoId("vid_no_snippet");
        item.setId(resourceId);
        // snippet intentionally left null

        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of(item));
        doReturn(response).when(service).executeSearch(anyString());

        List<YoutubeVideoApiInfo> result = service.searchVideos("Title", "Composer");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getVideoId()).isEqualTo("vid_no_snippet");
        assertThat(result.get(0).getTitle()).isNull();
    }

    @Test
    void searchVideos_itemWithNoThumbnail_thumbnailUrlIsNull() throws IOException {
        SearchResultSnippet snippet = new SearchResultSnippet();
        snippet.setTitle("No Thumb Video");
        snippet.setThumbnails(null);

        SearchResult item = new SearchResult();
        item.setId(buildResourceId("vid_no_thumb"));
        item.setSnippet(snippet);

        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of(item));
        doReturn(response).when(service).executeSearch(anyString());

        List<YoutubeVideoApiInfo> result = service.searchVideos("Title", "Composer");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getThumbnailUrl()).isNull();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // searchVideos — query building
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void searchVideos_queryContainsTitleComposerAndSuffix() throws IOException {
        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of());
        doReturn(response).when(service).executeSearch(anyString());

        service.searchVideos("Clair de Lune", "Debussy");

        verify(service).executeSearch("Clair de Lune+Debussy+piano+tutorial");
    }

    @Test
    void searchVideos_nullTitle_queryStartsWithComposer() throws IOException {
        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of());
        doReturn(response).when(service).executeSearch(anyString());

        service.searchVideos(null, "Bach");

        verify(service).executeSearch("Bach+piano+tutorial");
    }

    @Test
    void searchVideos_nullComposer_queryStartsWithTitle() throws IOException {
        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of());
        doReturn(response).when(service).executeSearch(anyString());

        service.searchVideos("Für Elise", null);

        verify(service).executeSearch("Für Elise+piano+tutorial");
    }

    @Test
    void searchVideos_bothNull_queryIsOnlySuffix() throws IOException {
        SearchListResponse response = new SearchListResponse();
        response.setItems(List.of());
        doReturn(response).when(service).executeSearch(anyString());

        service.searchVideos(null, null);

        verify(service).executeSearch("+piano+tutorial");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // searchVideos — IOException propagation
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    void searchVideos_ioException_throwsYoutubeApiException() throws IOException {
        doThrow(new IOException("network failure"))
                .when(service).executeSearch(anyString());

        assertThatThrownBy(() -> service.searchVideos("Title", "Composer"))
                .isInstanceOf(YoutubeService.YoutubeApiException.class)
                .hasMessageContaining("Failed to query YouTube API")
                .hasCauseInstanceOf(IOException.class);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private SearchResult buildSearchResult(
            String videoId, String title, String description,
            String channelTitle, String thumbnailUrl, long publishedMillis) {

        ResourceId id = buildResourceId(videoId);

        Thumbnail thumbnail = new Thumbnail();
        thumbnail.setUrl(thumbnailUrl);

        ThumbnailDetails thumbnails = new ThumbnailDetails();
        thumbnails.setMedium(thumbnail);

        SearchResultSnippet snippet = new SearchResultSnippet();
        snippet.setTitle(title);
        snippet.setDescription(description);
        snippet.setChannelTitle(channelTitle);
        snippet.setThumbnails(thumbnails);
        if (publishedMillis > 0) {
            snippet.setPublishedAt(new DateTime(publishedMillis));
        }

        SearchResult result = new SearchResult();
        result.setId(id);
        result.setSnippet(snippet);
        return result;
    }

    private ResourceId buildResourceId(String videoId) {
        ResourceId id = new ResourceId();
        id.setVideoId(videoId);
        return id;
    }
}


