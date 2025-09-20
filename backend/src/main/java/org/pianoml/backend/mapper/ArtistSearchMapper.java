package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.pianoml.backend.model.ArtistSearchResult;
import org.pianoml.backend.model.MbAuthorApiInfo;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

@Mapper(componentModel = "spring")
public interface ArtistSearchMapper {

    @Mapping(target = "id", source = "id")
    @Mapping(target = "name", source = "name")
    @Mapping(target = "sortName", source = "sortName")
    @Mapping(target = "type", source = "type")
    @Mapping(target = "gender", source = "gender")
    @Mapping(target = "country", source = "country")
    @Mapping(target = "disambiguation", source = "disambiguation")
    @Mapping(target = "lifeSpan.begin", source = "lifeSpan.begin", qualifiedByName = "parseFlexibleDate")
    @Mapping(target = "lifeSpan.end", source = "lifeSpan.end", qualifiedByName = "parseFlexibleDate")
    @Mapping(target = "lifeSpan.ended", source = "lifeSpan.ended")
    MbAuthorApiInfo toMbAuthorApiInfo(ArtistSearchResult.MbArtistResult artist);

    List<MbAuthorApiInfo> toMbAuthorApiInfoList(List<ArtistSearchResult.MbArtistResult> artists);

    default MbAuthorApiInfo mapSearchResult(ArtistSearchResult searchResult) {
        if (searchResult == null || searchResult.getArtists() == null || searchResult.getArtists().isEmpty()) {
            return null;
        }
        // Prendre le premier résultat (meilleur score)
        return toMbAuthorApiInfo(searchResult.getArtists().get(0));
    }

    /**
     * Convertit une chaîne de date MusicBrainz en format ISO date string.
     * Supporte les formats: yyyy, yyyy-MM, yyyy-MM-dd
     * Retourne null pour les dates non décodables
     */
    @org.mapstruct.Named("parseFlexibleDate")
    default String parseFlexibleDate(String dateString) {
        if (dateString == null || dateString.trim().isEmpty()) {
            return null;
        }

        try {
            String trimmedDate = dateString.trim();

            // Format complet: yyyy-MM-dd (déjà valide)
            if (trimmedDate.matches("\\d{4}-\\d{2}-\\d{2}")) {
                // Vérifier que la date est valide
                LocalDate.parse(trimmedDate, DateTimeFormatter.ISO_LOCAL_DATE);
                return trimmedDate;
            }

            // Format année-mois: yyyy-MM -> yyyy-MM-01
            if (trimmedDate.matches("\\d{4}-\\d{2}")) {
                String fullDate = trimmedDate + "-01";
                // Vérifier que la date est valide
                LocalDate.parse(fullDate, DateTimeFormatter.ISO_LOCAL_DATE);
                return fullDate;
            }

            // Format année seule: yyyy -> yyyy-01-01
            if (trimmedDate.matches("\\d{4}")) {
                String fullDate = trimmedDate + "-01-01";
                // Vérifier que la date est valide
                LocalDate.parse(fullDate, DateTimeFormatter.ISO_LOCAL_DATE);
                return fullDate;
            }

            // Si aucun format ne correspond, retourner null
            return null;

        } catch (DateTimeParseException | NumberFormatException e) {
            // En cas d'erreur de parsing, retourner null
            return null;
        }
    }
}
