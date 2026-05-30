package org.pianoml.backend.service;

import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.jackson2.JacksonFactory;
import com.google.api.services.youtube.YouTube;
import com.google.api.services.youtube.model.SearchListResponse;
import com.google.api.services.youtube.model.SearchResult;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.model.YoutubeVideoApiInfo;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class YoutubeService {

    private static final String APPLICATION_NAME = "PianoML";
    private static final long MAX_RESULTS = 10L;

    @Value("${youtube.api.key:}")
    private String apiKey;

    /**
     * Search YouTube for piano tutorial videos related to a score.
     *
     * @param title    the score title
     * @param composer the composer name
     * @return list of YoutubeVideoApiInfo
     */
    public List<YoutubeVideoApiInfo> searchVideos(String title, String composer) {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("YouTube API key is not configured (youtube.api.key)");
            return Collections.emptyList();
        }

        try {
            String query = buildQuery(title, composer);
            log.debug("YouTube search query: {}", query);

            SearchListResponse response = executeSearch(query);
            List<SearchResult> items = response.getItems();

            if (items == null) {
                return Collections.emptyList();
            }

            return items.stream()
                    .map(this::toApiInfo)
                    .collect(Collectors.toList());

        } catch (IOException e) {
            log.error("Error calling YouTube API: {}", e.getMessage(), e);
            throw new YoutubeApiException("Failed to query YouTube API", e);
        }
    }

    /**
     * Executes the YouTube search API call.
     * Extracted as a protected method to allow mocking in unit tests.
     */
    protected SearchListResponse executeSearch(String query) throws IOException {
        YouTube youtube = new YouTube.Builder(
                new NetHttpTransport(),
                JacksonFactory.getDefaultInstance(),
                request -> {
                })
                .setApplicationName(APPLICATION_NAME)
                .build();

        YouTube.Search.List search = youtube.search().list(List.of("snippet"));
        search.setKey(apiKey);
        search.setQ(query);
        search.setType(List.of("video"));
        search.setMaxResults(MAX_RESULTS);

        return search.execute();
    }

    private String buildQuery(String title, String composer) {
        StringBuilder sb = new StringBuilder();
        if (title != null && !title.isBlank()) {
            sb.append(title.trim());
        }
        if (composer != null && !composer.isBlank()) {
            if (sb.length() > 0) sb.append("+");
            sb.append(composer.trim());
        }
        sb.append("+piano+tutorial");
        return sb.toString();
    }

    private YoutubeVideoApiInfo toApiInfo(SearchResult item) {
        YoutubeVideoApiInfo info = new YoutubeVideoApiInfo();
        if (item.getId() != null) {
            info.setVideoId(item.getId().getVideoId());
        }
        if (item.getSnippet() != null) {
            info.setTitle(item.getSnippet().getTitle());
            info.setDescription(item.getSnippet().getDescription());
            info.setChannelTitle(item.getSnippet().getChannelTitle());
            if (item.getSnippet().getThumbnails() != null
                    && item.getSnippet().getThumbnails().getMedium() != null) {
                info.setThumbnailUrl(item.getSnippet().getThumbnails().getMedium().getUrl());
            }
            if (item.getSnippet().getPublishedAt() != null) {
                try {
                    long millis = item.getSnippet().getPublishedAt().getValue();
                    info.setPublishedAt(
                            OffsetDateTime.ofInstant(
                                    java.time.Instant.ofEpochMilli(millis),
                                    java.time.ZoneOffset.UTC));
                } catch (Exception e) {
                    log.debug("Could not parse publishedAt for video {}", info.getVideoId());
                }
            }
        }
        return info;
    }

    /**
     * Runtime exception thrown when the YouTube API call fails.
     */
    public static class YoutubeApiException extends RuntimeException {
        public YoutubeApiException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}

