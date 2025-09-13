package org.pianoml.backend.service;

import jakarta.validation.constraints.NotNull;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.exception.MusicBrainzException;
import org.pianoml.backend.mapper.AuthorMapper;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.repository.AuthorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;


@Service
public class AuthorService {

  @Autowired
  private AuthorRepository authorRepository;

  @Autowired
  private AuthorMapper authorMapper;

  @Autowired
  private MusicBrainzService musicBrainzService;


  public Author maybeCreateAuthor(@NotNull UUID mbid) {
    Optional<Author> optAuthor = authorRepository.findByMbid(mbid);
    if (optAuthor.isPresent()) {
      return optAuthor.get();
    } else {
      try {
        Author author = musicBrainzService.getAuthor(mbid);
        author.setId(null);
        authorRepository.save(author);
        return author;
      } catch (HttpClientErrorException e) {
        throw new MusicBrainzException("Failed to fetch author from MusicBrainz: " + e.getMessage());
      }

    }
  }

  public AuthorApiInfo createAuthor(AuthorApiInfo authorApiInfo) {
    Author author = maybeCreateAuthor(UUID.fromString(authorApiInfo.getMbid()));
    return authorMapper.toAuthorApiInfo(author);
  }

  public Optional<AuthorApiInfo> getAuthor(UUID id) {
    return authorRepository.findByMbid(id)
      .map(authorMapper::toAuthorApiInfo);
  }

  public Optional<AuthorApiInfo> updateAuthor(UUID mbid, AuthorApiInfo authorApiInfo) {
    return authorRepository.findByMbid(mbid)
      .map(author -> {
        author.setName(authorApiInfo.getName());
        Author updatedAuthor = authorRepository.save(author);
        return authorMapper.toAuthorApiInfo(updatedAuthor);
      });
  }

  public List<AuthorApiInfo> searchAuthors(String query) {
    Iterable<Author> authors = authorRepository.searchByNameIlike(query);
    return StreamSupport.stream(authors.spliterator(), false)
      .map(authorMapper::toAuthorApiInfo)
      .collect(Collectors.toList());
  }
}
