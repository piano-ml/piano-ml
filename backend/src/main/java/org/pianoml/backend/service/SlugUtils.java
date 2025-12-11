package org.pianoml.backend.service;

import org.pianoml.backend.entity.Score;
import org.pianoml.backend.repository.ScoreRepository;

import java.text.Normalizer;
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

  public static Score createUniqueSlug(Score score, ScoreRepository scoreRepository) {
    String baseSlug = createSlug(score);

    // Chercher tous les scores avec un immutable_slug commençant par baseSlug
    List<Score> existingSlugs = scoreRepository.findByImmutableSlugStartingWith(baseSlug);

    // Filtrer pour ne garder que ceux qui correspondent exactement au pattern baseSlug ou baseSlug-{number}
    String finalBaseSlug = baseSlug;
    long conflictCount = existingSlugs.stream()
      .map(Score::getImmutableSlug)
      .filter(slug -> slug.equals(finalBaseSlug) || slug.matches(finalBaseSlug + "-\\d+"))
      .count();

    // Si il y a des conflits, ajouter un compteur
    if (conflictCount > 0) {
      baseSlug = baseSlug + "-" + conflictCount;
      score.setVersion((int) (conflictCount + 1));
    }
    score.setImmutableSlug(baseSlug);
    score.setMutableSlug(baseSlug);

    return score;
  }

  private static String createSlug(String author, String title) {
    if (author == null || title == null) {
      throw new IllegalArgumentException("Author and title must not be null");
    }

    // Pour l'auteur : remplacer les espaces par "-" et traitement spécifique
    String authorSlug = normalizeToSlug(author, true);

    // Pour le titre : traitement standard
    String titleSlug = normalizeToSlug(title, false);

    return authorSlug + "-" + titleSlug;
  }

  /**
   * Normalise une chaîne en slug en supprimant les accents et en appliquant les règles de formatage
   * @param input la chaîne à normaliser
   * @param preserveSpacesAsHyphens si true, remplace les espaces par des tirets, sinon traite tout comme des caractères non-alphanumériques
   * @return la chaîne normalisée en slug
   */
  private static String normalizeToSlug(String input, boolean preserveSpacesAsHyphens) {
    if (input == null || input.trim().isEmpty()) {
      return "";
    }

    // 1. Supprimer les accents en utilisant Normalizer (équivalent à StringUtils.stripAccents d'Apache Commons Lang)
    String normalized = Normalizer.normalize(input.trim(), Normalizer.Form.NFD)
        .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");

    // 2. Conversion en minuscules
    normalized = normalized.toLowerCase();

    // 3. Traitement spécifique selon le type
    if (preserveSpacesAsHyphens) {
      // Pour l'auteur : remplacer les espaces par "-" puis supprimer les autres caractères non-alphanumériques
      normalized = normalized
          .replaceAll("\\s+", "-")           // Remplace les espaces par "-"
          .replaceAll("[^a-zA-Z0-9-]", "");   // Supprime tout ce qui n'est pas alphanumérique ou "-"
    } else {
      // Pour le titre : remplacer tous les caractères non-alphanumériques par "-"
      normalized = normalized.replaceAll("[^a-zA-Z0-9]", "-");
    }

    // 4. Nettoyer les tirets multiples et les tirets en début/fin
    normalized = normalized
        .replaceAll("-+", "-")             // Remplace les "-" multiples par un seul "-"
        .replaceAll("^-|-$", "");          // Supprime les "-" au début et à la fin

    return normalized;
  }
}
