package org.pianoml.backend.mapper;

import java.util.UUID;
import javax.annotation.processing.Generated;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.model.AuthorApiInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2025-08-06T14:23:43+0000",
    comments = "version: 1.5.5.Final, compiler: javac, environment: Java 21.0.8 (Ubuntu)"
)
@Component
public class AuthorMapperImpl implements AuthorMapper {

    @Autowired
    private UriMapper uriMapper;

    @Override
    public AuthorApiInfo toAuthorApiInfo(Author author) {
        if ( author == null ) {
            return null;
        }

        AuthorApiInfo authorApiInfo = new AuthorApiInfo();

        if ( author.getId() != null ) {
            authorApiInfo.setId( author.getId().toString() );
        }
        authorApiInfo.setName( author.getName() );
        authorApiInfo.setBirth( author.getBirth() );
        authorApiInfo.setBio( author.getBio() );
        authorApiInfo.setImage( uriMapper.asUri( author.getImage() ) );
        authorApiInfo.setLink( uriMapper.asUri( author.getLink() ) );

        return authorApiInfo;
    }

    @Override
    public Author toAuthor(AuthorApiInfo authorApiInfo) {
        if ( authorApiInfo == null ) {
            return null;
        }

        Author author = new Author();

        if ( authorApiInfo.getId() != null ) {
            author.setId( UUID.fromString( authorApiInfo.getId() ) );
        }
        author.setName( authorApiInfo.getName() );
        author.setBirth( authorApiInfo.getBirth() );
        author.setBio( authorApiInfo.getBio() );
        author.setImage( uriMapper.asString( authorApiInfo.getImage() ) );
        author.setLink( uriMapper.asString( authorApiInfo.getLink() ) );

        return author;
    }
}
