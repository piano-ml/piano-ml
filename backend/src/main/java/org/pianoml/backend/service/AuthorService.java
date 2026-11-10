package org.pianoml.backend.service;

import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.exception.MusicBrainzException;
import org.pianoml.backend.mapper.AuthorMapper;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.repository.AuthorRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import static org.pianoml.backend.service.SlugUtils.normalizeToSlug;


@Service
@RequiredArgsConstructor
public class AuthorService {

  private final AuthorRepository authorRepository;

  private final AuthorMapper authorMapper;

  private final MusicBrainzService musicBrainzService;

  public Author maybeCreateAuthor(@NotNull UUID mbid) {
    Optional<Author> optAuthor = authorRepository.findByMbid(mbid);
    if (optAuthor.isPresent()) {
      return optAuthor.get();
    } else {
      try {
        Author author = musicBrainzService.getAuthor(mbid);
        if (author == null) {
          throw new MusicBrainzException("MusicBrainz returned no author for mbid: " + mbid);
        }
        author.setId(null);
        author.setSlug(normalizeToSlug(author.getSortName(), true));
        authorRepository.save(author);
        return author;
      } catch (HttpClientErrorException e) {
        throw new MusicBrainzException("Failed to fetch author from MusicBrainz: " + e.getMessage());
      }

    }
  }

  /**
   * Creates (or reuses) an author from MusicBrainz. Any authenticated user may do this;
   * editorial fields are only applied when {@code isAdmin} is true.
   */
  public AuthorApiInfo createAuthor(AuthorApiInfo authorApiInfo, boolean isAdmin) {
    Author author = maybeCreateAuthor(UUID.fromString(authorApiInfo.getMbid()));
    if (!isAdmin) {
      return authorMapper.toAuthorApiInfo(author);
    }
    applyEditorialFields(author, authorApiInfo);
    return authorMapper.toAuthorApiInfo(authorRepository.save(author));
  }

  public Optional<AuthorApiInfo> getAuthor(UUID id) {
    return authorRepository.findByMbid(id)
      .map(authorMapper::toAuthorApiInfo);
  }

  public Optional<AuthorApiInfo> updateAuthor(UUID id, AuthorApiInfo authorApiInfo, boolean isAdmin) {
    return authorRepository.findById(id)
      .map(author -> {
        if (authorApiInfo.getName() != null) {
          author.setName(authorApiInfo.getName());
        }
        if (isAdmin) {
          applyEditorialFields(author, authorApiInfo);
        }
        Author updatedAuthor = authorRepository.save(author);
        return authorMapper.toAuthorApiInfo(updatedAuthor);
      });
  }

  /**
   * Admin-only fields: description, composer bio link, image, imageHq.
   * A field that is omitted (null) keeps its stored value, so partial payloads never wipe data.
   */
  private static void applyEditorialFields(Author author, AuthorApiInfo authorApiInfo) {
    if (authorApiInfo.getDescription() != null) {
      author.setDescription(authorApiInfo.getDescription());
    }
    if (authorApiInfo.getComposerBioLink() != null) {
      author.setComposerBioLink(authorApiInfo.getComposerBioLink().toString());
    }
    if (authorApiInfo.getImage() != null) {
      author.setImage(authorApiInfo.getImage());
    }
    if (authorApiInfo.getImageHq() != null) {
      author.setImageHq(authorApiInfo.getImageHq());
    }
  }

  public List<AuthorApiInfo> searchAuthors(String query) {
    Iterable<Author> authors = authorRepository.searchByNameIlike(query);
    return StreamSupport.stream(authors.spliterator(), false)
      .map(authorMapper::toAuthorApiInfo)
      .collect(Collectors.toList());
  }
}
