package org.pianoml.backend.service;

import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.jackson2.JacksonFactory;
import com.google.api.services.youtube.YouTube;
import com.google.api.services.youtube.model.SearchListResponse;
import com.google.api.services.youtube.model.SearchResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pianoml.backend.entity.YoutubeRank;
import org.pianoml.backend.model.YoutubeVideoApiInfo;
import org.pianoml.backend.repository.YoutubeRankRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class YoutubeService {

    private static final String APPLICATION_NAME = "PianoML";
    private static final long MAX_RESULTS = 10L;

    @Value("${youtube.api.key:}")
    private String apiKey;

    private final YoutubeRankRepository youtubeRankRepository;

    /**
     * Search YouTube for piano tutorial videos related to a score.
     * Checks the database cache first; falls back to the YouTube API if no cached results exist.
     *
     * @param scoreId  the UUID of the score (used as cache key)
     * @param title    the score title
     * @param composer the composer name
     * @return list of YoutubeVideoApiInfo
     */
    @Transactional
    public List<YoutubeVideoApiInfo> searchVideos(UUID scoreId, String title, String composer) {
        // 1. Check the database cache
        if (scoreId != null) {
            List<YoutubeRank> cachedRows = youtubeRankRepository
                    .findByScoreIdAndYoutubeVideoApiInfoIsNotNull(scoreId);
            if (!cachedRows.isEmpty()) {
                log.debug("YouTube cache hit for scoreId={}, {} result(s)", scoreId, cachedRows.size());
                return cachedRows.stream()
                        .map(YoutubeRank::getYoutubeVideoApiInfo)
                        .collect(Collectors.toList());
            }
        }

        // 2. Cache miss – call the YouTube API
        List<YoutubeVideoApiInfo> videos = searchVideos(title, composer);

        // 3. Persist results into the cache
        if (scoreId != null && !videos.isEmpty()) {
            for (YoutubeVideoApiInfo info : videos) {
                if (info.getVideoId() == null) continue;
                YoutubeRank row = youtubeRankRepository
                        .findByScoreIdAndVideoId(scoreId, info.getVideoId())
                        .orElseGet(() -> new YoutubeRank(scoreId, info.getVideoId()));
                row.setYoutubeVideoApiInfo(info);
                youtubeRankRepository.save(row);
            }
            log.debug("YouTube cache stored {} result(s) for scoreId={}", videos.size(), scoreId);
        }

        return videos;
    }

    /**
     * Search YouTube without caching (raw API call).
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
            if (!sb.isEmpty()) sb.append("+");
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
