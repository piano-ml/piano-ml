package org.pianoml.backend.service;

import org.pianoml.backend.entity.Genre;
import org.pianoml.backend.mapper.GenreMapper;
import org.pianoml.backend.model.GenreApiInfo;
import org.pianoml.backend.repository.GenreRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class GenreService {

  @Autowired
  private GenreRepository genreRepository;

  @Autowired
  private GenreMapper genreMapper;

  public GenreApiInfo createGenre(GenreApiInfo genreApiInfos) {
    Genre newGenre = genreRepository.save(genreMapper.toGenre(genreApiInfos));
    return genreMapper.toGenreApiInfo(newGenre);
  }

  public Optional<GenreApiInfo> getGenre(UUID id) {
    Optional<Object[]> raw = genreRepository.findByIdWithScoreCountRaw(id);
    // Use flatMap and validate the raw array length to avoid ArrayIndexOutOfBoundsException
    return raw.flatMap(a -> {
      if (a.length == 0) {
        return Optional.empty();
      }
      GenreApiInfo info = mapRawToGenreApiInfo(a);
      return Optional.of(info);
    });
  }

  public List<GenreApiInfo> getAllGenres() {
    return genreRepository.findAllWithScoreCountRaw().stream()
      .map(this::mapRawToGenreApiInfo)
      .collect(Collectors.toList());
  }

  public Optional<GenreApiInfo> updateGenre(UUID id, GenreApiInfo genreApiInfo) {
    return genreRepository.findById(id)
      .map(genre -> {
        genre.setName(genreApiInfo.getName());
        genre.setDescription(genreApiInfo.getDescription());
        Genre updatedGenre = genreRepository.save(genre);
        return genreMapper.toGenreApiInfo(updatedGenre);
      });
  }

  public List<GenreApiInfo> searchGenres(String query) {
    return genreRepository.findByNameContainingIgnoreCase(query).stream()
      .map(genreMapper::toGenreApiInfo)
      .collect(Collectors.toList());
  }

  // Helper to safely map raw repository results to GenreApiInfo
  private GenreApiInfo mapRawToGenreApiInfo(Object[] a) {
    GenreApiInfo info = new GenreApiInfo();
    if (a == null) return info;
    if (a.length > 0 && a[0] != null) info.setId(a[0].toString());
    if (a.length > 1 && a[1] != null) info.setMbid(a[1].toString());
    if (a.length > 2 && a[2] != null) info.setName(a[2].toString());
    if (a.length > 3) {
      long count = a[3] == null ? 0L : ((Number) a[3]).longValue();
      info.setScoreCount((int) count);
    }
    if (a.length > 4 && a[4] != null) info.setDescription(a[4].toString());
    return info;
  }
}
