package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.exception.MusicBrainzException;
import org.pianoml.backend.mapper.AuthorMapper;
import org.pianoml.backend.mapper.AuthorMapperImpl;
import org.pianoml.backend.mapper.UriMapper;
import org.pianoml.backend.model.AuthorApiInfo;
import org.pianoml.backend.repository.AuthorRepository;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.URI;
import java.util.List;
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

  @Spy
  private AuthorMapper authorMapper = realMapper();

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

  private static AuthorMapper realMapper() {
    AuthorMapperImpl impl = new AuthorMapperImpl();
    ReflectionTestUtils.setField(impl, "uriMapper", new UriMapper());
    return impl;
  }

  private static Author storedAuthorWithImages(UUID id) {
    Author author = new Author();
    author.setId(id);
    author.setMbid(UUID.randomUUID());
    author.setName("Chopin");
    author.setImage("https://img.example/old.jpg");
    author.setImageHq("https://img.example/old-hq.jpg");
    return author;
  }

  private static AuthorApiInfo payload() {
    AuthorApiInfo api = new AuthorApiInfo();
    api.setName("Frédéric Chopin");
    api.setDescription("desc");
    api.setComposerBioLink(URI.create("https://en.wikipedia.org/wiki/Chopin"));
    return api;
  }

  private static Author storedWithEditorial(UUID id) {
    Author author = storedAuthorWithImages(id);
    author.setDescription("old desc");
    author.setComposerBioLink("https://old.example/bio");
    return author;
  }

  private static AuthorApiInfo fullEditorialPayload() {
    AuthorApiInfo api = payload();
    api.setImage("https://img.example/new.jpg");
    api.setImageHq("https://img.example/new-hq.jpg");
    return api;
  }

  private static void assertEditorialUnchanged(Author a) {
    assertEquals("old desc", a.getDescription());
    assertEquals("https://old.example/bio", a.getComposerBioLink());
    assertEquals("https://img.example/old.jpg", a.getImage());
    assertEquals("https://img.example/old-hq.jpg", a.getImageHq());
  }

  @Test
  public void updateAuthor_admin_overridesEditorialFields() {
    UUID id = UUID.randomUUID();
    Author stored = storedWithEditorial(id);
    when(authorRepository.findById(id)).thenReturn(Optional.of(stored));
    when(authorRepository.save(stored)).thenReturn(stored);

    AuthorApiInfo result = authorService.updateAuthor(id, fullEditorialPayload(), true).orElseThrow();

    assertEquals("desc", stored.getDescription());
    assertEquals("https://en.wikipedia.org/wiki/Chopin", stored.getComposerBioLink());
    assertEquals("https://img.example/new.jpg", result.getImage());
    assertEquals("https://img.example/new-hq.jpg", result.getImageHq());
  }

  @Test
  public void updateAuthor_admin_omittedFieldsKeepStoredValues() {
    UUID id = UUID.randomUUID();
    Author stored = storedWithEditorial(id);
    when(authorRepository.findById(id)).thenReturn(Optional.of(stored));
    when(authorRepository.save(stored)).thenReturn(stored);

    AuthorApiInfo onlyName = new AuthorApiInfo();
    onlyName.setName("Frédéric Chopin");

    AuthorApiInfo result = authorService.updateAuthor(id, onlyName, true).orElseThrow();

    assertEditorialUnchanged(stored);
    assertEquals("Frédéric Chopin", result.getName());
  }

  @Test
  public void updateAuthor_nonAdmin_ignoresEditorialFields() {
    UUID id = UUID.randomUUID();
    Author stored = storedWithEditorial(id);
    when(authorRepository.findById(id)).thenReturn(Optional.of(stored));
    when(authorRepository.save(stored)).thenReturn(stored);

    AuthorApiInfo result = authorService.updateAuthor(id, fullEditorialPayload(), false).orElseThrow();

    assertEditorialUnchanged(stored);
    assertEquals("https://img.example/old.jpg", result.getImage());
  }

  @Test
  public void createAuthor_admin_persistsEditorialFields() {
    Author existing = new Author();
    existing.setMbid(mbid);
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.of(existing));
    when(authorRepository.save(existing)).thenReturn(existing);

    AuthorApiInfo input = payload();
    input.setMbid(mbid.toString());
    input.setImage("https://img.example/c.jpg");

    AuthorApiInfo result = authorService.createAuthor(input, true);

    verify(authorRepository).save(existing);
    assertEquals("desc", existing.getDescription());
    assertEquals("https://en.wikipedia.org/wiki/Chopin", existing.getComposerBioLink());
    assertEquals("https://img.example/c.jpg", result.getImage());
    assertNull(existing.getImageHq());
  }

  @Test
  public void createAuthor_nonAdmin_stillCreatesFromMusicBrainz_butIgnoresEditorialFields() {
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.empty());
    Author mbAuthor = new Author();
    mbAuthor.setMbid(mbid);
    mbAuthor.setName("Chopin");
    mbAuthor.setSortName("Chopin, Frédéric");
    when(musicBrainzService.getAuthor(mbid)).thenReturn(mbAuthor);

    AuthorApiInfo input = fullEditorialPayload();
    input.setMbid(mbid.toString());

    AuthorApiInfo result = authorService.createAuthor(input, false);

    verify(authorRepository, times(1)).save(mbAuthor); // only the MusicBrainz creation save
    assertEquals("Chopin", result.getName());
    assertNull(mbAuthor.getDescription());
    assertNull(mbAuthor.getComposerBioLink());
    assertNull(mbAuthor.getImage());
    assertNull(mbAuthor.getImageHq());
  }

  @Test
  public void createAuthor_nonAdmin_existingAuthor_isUnchanged() {
    Author existing = storedWithEditorial(UUID.randomUUID());
    existing.setMbid(mbid);
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.of(existing));

    AuthorApiInfo input = fullEditorialPayload();
    input.setMbid(mbid.toString());

    authorService.createAuthor(input, false);

    verify(authorRepository, never()).save(any());
    assertEditorialUnchanged(existing);
  }

  @Test
  public void maybeCreateAuthor_whenMusicBrainzFails_throwsMusicBrainzException() {
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.empty());
    when(musicBrainzService.getAuthor(mbid)).thenThrow(
      new org.springframework.web.client.HttpClientErrorException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE));

    MusicBrainzException ex = assertThrows(MusicBrainzException.class, () -> authorService.maybeCreateAuthor(mbid));
    assertTrue(ex.getMessage().startsWith("Failed to fetch author from MusicBrainz"));
    verify(authorRepository, never()).save(any());
  }

  @Test
  public void updateAuthor_withoutName_keepsTheStoredName() {
    UUID id = UUID.randomUUID();
    Author stored = storedWithEditorial(id);
    when(authorRepository.findById(id)).thenReturn(Optional.of(stored));
    when(authorRepository.save(stored)).thenReturn(stored);

    AuthorApiInfo noName = new AuthorApiInfo();
    authorService.updateAuthor(id, noName, true);

    assertEquals("Chopin", stored.getName());
  }

  @Test
  public void updateAuthor_unknownAuthor_isEmpty() {
    UUID id = UUID.randomUUID();
    when(authorRepository.findById(id)).thenReturn(Optional.empty());
    assertTrue(authorService.updateAuthor(id, payload(), true).isEmpty());
    verify(authorRepository, never()).save(any());
  }

  @Test
  public void getAuthor_mapsByMbid_andIsEmptyWhenUnknown() {
    Author author = storedAuthorWithImages(UUID.randomUUID());
    when(authorRepository.findByMbid(mbid)).thenReturn(Optional.of(author));
    UUID unknown = UUID.randomUUID();
    when(authorRepository.findByMbid(unknown)).thenReturn(Optional.empty());

    assertEquals("https://img.example/old.jpg", authorService.getAuthor(mbid).orElseThrow().getImage());
    assertTrue(authorService.getAuthor(unknown).isEmpty());
  }

  @Test
  public void searchAuthors_mapsEveryMatch() {
    when(authorRepository.searchByNameIlike("cho")).thenReturn(
      List.of(storedAuthorWithImages(UUID.randomUUID()), storedAuthorWithImages(UUID.randomUUID())));

    List<AuthorApiInfo> found = authorService.searchAuthors("cho");

    assertEquals(2, found.size());
    assertEquals("Chopin", found.get(0).getName());
  }
}
