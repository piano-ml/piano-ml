package org.pianoml.backend.mapper;

import java.util.UUID;
import javax.annotation.processing.Generated;
import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.model.GenreApiInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2025-08-06T17:29:57+0200",
    comments = "version: 1.5.5.Final, compiler: javac, environment: Java 17.0.9 (JetBrains s.r.o.)"
)
@Component
public class GenreMapperImpl implements GenreMapper {

    @Autowired
    private UriMapper uriMapper;

    @Override
    public GenreApiInfo toGenreApiInfo(Genre genre) {
        if ( genre == null ) {
            return null;
        }

        GenreApiInfo genreApiInfo = new GenreApiInfo();

        if ( genre.getId() != null ) {
            genreApiInfo.setId( genre.getId().toString() );
        }
        genreApiInfo.setName( genre.getName() );
        genreApiInfo.setUrl( genre.getUrl() );
        genreApiInfo.setImage( uriMapper.asUri( genre.getImage() ) );

        return genreApiInfo;
    }

    @Override
    public Genre toGenre(GenreApiInfo genreApiInfo) {
        if ( genreApiInfo == null ) {
            return null;
        }

        Genre genre = new Genre();

        if ( genreApiInfo.getId() != null ) {
            genre.setId( UUID.fromString( genreApiInfo.getId() ) );
        }
        genre.setName( genreApiInfo.getName() );
        genre.setUrl( genreApiInfo.getUrl() );
        genre.setImage( uriMapper.asString( genreApiInfo.getImage() ) );

        return genre;
    }
}
