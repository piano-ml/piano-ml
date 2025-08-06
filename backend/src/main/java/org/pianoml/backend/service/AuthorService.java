package org.pianoml.backend.service;

import org.pianoml.backend.entity.Author;
import org.pianoml.backend.mapper.AuthorMapper;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.repository.AuthorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;


@Service
public class AuthorService {

    @Autowired
    private AuthorRepository authorRepository;

    @Autowired
    private AuthorMapper authorMapper;

    public AuthorApiInfo createAuthor(AuthorApiInfo authorApiInfo) {
        Author author = authorMapper.toAuthor(authorApiInfo);
        Author savedAuthor = authorRepository.save(author);
        return authorMapper.toAuthorApiInfo(savedAuthor);
    }

    public Optional<AuthorApiInfo> getAuthor(UUID id) {
        return authorRepository.findById(id)
                .map(authorMapper::toAuthorApiInfo);
    }

    public Optional<AuthorApiInfo> updateAuthor(UUID id, AuthorApiInfo authorApiInfo) {
        return authorRepository.findById(id)
                .map(author -> {
                    author.setName(authorApiInfo.getName());
                    author.setBirth(authorApiInfo.getBirth());
                    author.setBio(authorApiInfo.getBio());
                    author.setImage(authorApiInfo.getImage() != null ? authorApiInfo.getImage().toString() : null);
                    author.setLink(authorApiInfo.getLink() != null ? authorApiInfo.getLink().toString() : null);
                    Author updatedAuthor = authorRepository.save(author);
                    return authorMapper.toAuthorApiInfo(updatedAuthor);
                });
    }

    public List<AuthorApiInfo> searchAuthors(String query) {
        // This is a very basic search. A real implementation would use a more advanced search mechanism.
        return StreamSupport.stream(authorRepository.findAll().spliterator(), false)
                .filter(author -> author.getName().toLowerCase().contains(query.toLowerCase()))
                .map(authorMapper::toAuthorApiInfo)
                .collect(Collectors.toList());
    }
}
