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
import java.util.stream.StreamSupport;

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
    Optional<Object[]> raw = genreRepository.findByMbidWithScoreCountRaw(id);
    return raw.map(a -> {
      GenreApiInfo info = new GenreApiInfo();
      if (a[0] != null) info.setId(a[0].toString());
      if (a[1] != null) info.setMbid(a[1].toString());
      if (a[2] != null) info.setName(a[2].toString());
      Long count = a[3] == null ? 0L : ((Number) a[3]).longValue();
      info.setScoreCount(count.intValue());
      return info;
    });
  }

  public List<GenreApiInfo> getAllGenres() {
    return genreRepository.findAllWithScoreCountRaw().stream()
      .map(a -> {
        GenreApiInfo info = new GenreApiInfo();
        if (a[0] != null) info.setId(a[0].toString());
        if (a[1] != null) info.setMbid(a[1].toString());
        if (a[2] != null) info.setName(a[2].toString());
        Long count = a[3] == null ? 0L : ((Number) a[3]).longValue();
        info.setScoreCount(count.intValue());
        return info;
      })
      .collect(Collectors.toList());
  }

  public Optional<GenreApiInfo> updateGenre(UUID id, GenreApiInfo genreApiInfo) {
    return genreRepository.findByMbid(id)
      .map(genre -> {
        genre.setName(genreApiInfo.getName());
        Genre updatedGenre = genreRepository.save(genre);
        return genreMapper.toGenreApiInfo(updatedGenre);
      });
  }

  public List<GenreApiInfo> searchGenres(String query) {
    return genreRepository.findByNameContainingIgnoreCase(query).stream()
      .map(genreMapper::toGenreApiInfo)
      .collect(Collectors.toList());
  }
}
