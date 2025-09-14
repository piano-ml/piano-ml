package org.pianoml.backend.service;

import org.pianoml.backend.entity.Score;
import org.pianoml.backend.repository.ScoreRepository;

import java.util.List;

public class SlugUtils {

  public static String createSlug(Score score) {
    if (score == null || score.getAuthor() == null || score.getTitle() == null) {
      throw new IllegalArgumentException("Score, author, and title must not be null");
    }

    String baseSlug = createSlug(score.getAuthor().getSortName(), score.getTitle());

    // Si la version est supérieure à 1, ajouter "-{version}" au slug
    if (score.getVersion() != null && score.getVersion() > 1) {
      return baseSlug + "-" + score.getVersion();
    }

    return baseSlug;
  }

  public static String createUniqueSlug(Score score, ScoreRepository scoreRepository) {
    String baseSlug = createSlug(score);

    // Chercher tous les scores avec un immutable_slug commençant par baseSlug
    List<Score> existingSlugs = scoreRepository.findByImmutableSlugStartingWith(baseSlug);

    // Si aucun slug similaire n'existe, retourner le slug de base
    if (existingSlugs.isEmpty()) {
      return baseSlug;
    }

    // Filtrer pour ne garder que ceux qui correspondent exactement au pattern baseSlug ou baseSlug-{number}
    long conflictCount = existingSlugs.stream()
      .map(Score::getImmutableSlug)
      .filter(slug -> slug.equals(baseSlug) || slug.matches(baseSlug + "-\\d+"))
      .count();

    // Si il y a des conflits, ajouter un compteur
    if (conflictCount > 0) {
      return baseSlug + "-" + conflictCount;
    }

    return baseSlug;
  }

  private static String createSlug(String author, String title) {
    if (author == null || title == null) {
      throw new IllegalArgumentException("Author and title must not be null");
    }

    // Pour l'auteur : remplacer les espaces par "-" et supprimer les caractères non-alphanumériques
    String authorSlug = author
      .replaceAll("\\s+", "-")           // Remplace les espaces par "-"
      .replaceAll("[^a-zA-Z0-9-]", "")   // Supprime tout ce qui n'est pas alphanumérique ou "-"
      .replaceAll("-+", "-")             // Remplace les "-" multiples par un seul "-"
      .replaceAll("^-|-$", "")           // Supprime les "-" au début et à la fin
      .toLowerCase();

    // Pour le titre : remplacer les caractères non-alphanumériques par "-"
    String titleSlug = title
      .replaceAll("[^a-zA-Z0-9]", "-")   // Remplace les non-alphanumériques par "-"
      .replaceAll("-+", "-")             // Remplace les "-" multiples par un seul "-"
      .replaceAll("^-|-$", "")           // Supprime les "-" au début et à la fin
      .toLowerCase();

    return authorSlug + "-" + titleSlug;
  }
}
