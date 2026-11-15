/**
 * Visible text of the language-neutral content manifests (src/assets/shader/manifest.json,
 * src/assets/midi/manifest.json). Every language's build copies assets unchanged, so the JSON files only
 * hold English: components look their text up here by shader id or song file name, and fall back to the
 * JSON text, so a new shader or song shows in English until it is translated here.
 *
 * Shader names and song titles are names, like score titles, and are not translated.
 */

const SHADER_DESCRIPTIONS: Readonly<Record<number, string>> = {
  1: $localize`:@@shader.1.description:Wave-based animated shader`,
  2: $localize`:@@shader.2.description:Space-themed shader with stars and cosmic effects`,
  3: $localize`:@@shader.3.description:Wave-based animated shader`,
  4: $localize`:@@shader.4.description:Space-themed shader with stars and cosmic effects`,
  5: $localize`:@@shader.5.description:Colorful animated shader with dynamic gradients`,
  6: $localize`:@@shader.6.description:Colorful animated shader with dynamic gradients`,
  7: $localize`:@@shader.7.description:Colorful animated shader with dynamic gradients`
};

const SONG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'No-Woman-No-Cry-1.mid': $localize`:@@song.noWomanNoCry.description:Choose a track to play with accompaniment`,
  'plic-ploc.mid': $localize`:@@song.plicPloc.description:Exercise in rythm recognition and note reading`,
  'happy_birthday.mid': $localize`:@@song.happyBirthday.description:The most recognized song in the English language`,
  'Belle-Ile-en-Mer - Laurent Voulzy.mid': $localize`:@@song.belleIleEnMer.description:Exercise in chord progression`,
  'Brahms_Lullaby_-_Exercise_in_Chord_Progression.mid': $localize`:@@song.brahmsLullaby.description:Exercise in chord progression based on Brahms' Lullaby.`,
  'zelda-lullaby.mid': $localize`:@@song.zeldaLullaby.description:Melody of the Royal Family.`,
  'for_elise_by_beethoven.mid': $localize`:@@song.forElise.description:Try split voice option`
};

/** Song difficulty levels, a fixed list. */
const DIFFICULTIES: Readonly<Record<string, string>> = {
  beginner: $localize`:@@song.difficulty.beginner:beginner`,
  intermediate: $localize`:@@song.difficulty.intermediate:intermediate`,
  advanced: $localize`:@@song.difficulty.advanced:advanced`
};

const NO_DESCRIPTION = $localize`:@@shader.noDescription:No description available`;

/** A shader's description in the current language; the manifest's English text, or a placeholder. */
export function shaderDescription(id: number, fallback?: string): string {
  return SHADER_DESCRIPTIONS[id] || fallback || NO_DESCRIPTION;
}

/** A built-in song's description in the current language, by file name; the manifest text otherwise. */
export function songDescription(filename: string, fallback: string): string {
  return SONG_DESCRIPTIONS[filename] || fallback;
}

/** A difficulty level in the current language; an unknown level is shown as is. */
export function difficultyLabel(level: string): string {
  return DIFFICULTIES[level] || level;
}
