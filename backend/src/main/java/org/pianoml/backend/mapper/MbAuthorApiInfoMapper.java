package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.model.MbAuthorApiInfo;
import java.util.UUID;

@Mapper(componentModel = "spring")
public interface MbAuthorApiInfoMapper {

    @Mapping(target = "mbid", source = "id", qualifiedByName = "stringToUUID")
    @Mapping(target = "name", source = "name")
    @Mapping(target = "type", source = "type")
    @Mapping(target = "lifeSpanBegin", source = "lifeSpan.begin")
    @Mapping(target = "lifeSpanEnd", source = "lifeSpan.end")
    @Mapping(target = "lifeSpanEnded", source = "lifeSpan.ended")
    Author toAuthor(MbAuthorApiInfo artist);



    @Named("stringToUUID")
    public static UUID stringToUUID(String id) {
        if (id == null) return null;
        try {
            return UUID.fromString(id);
        } catch (Exception e) {
            return null;
        }
    }
}

