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
        return genreRepository.findByMbid(id)
                .map(genreMapper::toGenreApiInfo);
    }

    public List<GenreApiInfo> getAllGenres() {
        return StreamSupport.stream(genreRepository.findAll().spliterator(), false)
                .map(genreMapper::toGenreApiInfo)
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
