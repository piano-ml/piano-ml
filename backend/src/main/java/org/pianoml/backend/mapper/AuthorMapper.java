package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.model.AuthorApiInfo;

@Mapper(componentModel = "spring", uses = UriMapper.class)
public interface AuthorMapper {

    AuthorApiInfo toAuthorApiInfo(Author author);

    Author toAuthor(AuthorApiInfo authorApiInfo);
}
