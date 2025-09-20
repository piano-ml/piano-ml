package org.pianoml.backend.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

@Data
public class ArtistSearchResult {
    private String created;
    private Integer count;
    private Integer offset;
    private List<MbArtistResult> artists;

    @Data
    public static class MbArtistResult {
        private String id;
        private String type;
        @JsonProperty("type-id")
        private String typeId;
        private Integer score;
        @JsonProperty("gender-id")
        private String genderId;
        private String name;
        @JsonProperty("sort-name")
        private String sortName;
        private String gender;
        private String country;
        private String disambiguation;
        @JsonProperty("life-span")
        private LifeSpan lifeSpan;

        @Data
        public static class LifeSpan {
            private String begin;
            private String end;
            private Boolean ended;
        }
    }
}
