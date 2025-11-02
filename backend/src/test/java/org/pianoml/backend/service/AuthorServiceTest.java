package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.exception.MusicBrainzException;
import org.pianoml.backend.repository.AuthorRepository;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class AuthorServiceTest {

  @Mock
  private AuthorRepository authorRepository;

  @Mock
  private MusicBrainzService musicBrainzService;

  @InjectMocks
  private AuthorService authorService;

  private final UUID mbid = UUID.fromString("00000000-0000-0000-0000-000000000000");

  @Test
  public void maybeCreateAuthor_whenExists_returnsExisting() {
    Author existing = new Author();
    existing.setMbid(mbid);
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.of(existing));

    Author result = authorService.maybeCreateAuthor(mbid);
    assertSame(existing, result);
    verify(authorRepository, never()).save(any());
  }

  @Test
  public void maybeCreateAuthor_whenMbReturnsNull_throwsMusicBrainzException() {
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.empty());
    when(musicBrainzService.getAuthor(mbid)).thenReturn(null);

    assertThrows(MusicBrainzException.class, () -> authorService.maybeCreateAuthor(mbid));
    verify(authorRepository, never()).save(any());
  }

  @Test
  public void maybeCreateAuthor_whenMbReturnsAuthor_savesAndReturnsIt() {
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.empty());
    Author mbAuthor = new Author();
    mbAuthor.setMbid(mbid);
    when(musicBrainzService.getAuthor(mbid)).thenReturn(mbAuthor);

    Author saved = new Author();
    when(authorRepository.save(mbAuthor)).thenReturn(saved);

    Author result = authorService.maybeCreateAuthor(mbid);
    assertNotNull(result);
    verify(authorRepository).save(mbAuthor);
  }
}
