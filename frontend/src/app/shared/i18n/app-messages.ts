/**
 * Reserved messages shared by the app and scripts/generate-webmanifest.js, which reads the English text
 * from this file and the translations from each messages.<locale>.xlf: the installed app's name and its
 * shortcuts are translated in one place only. Keep each entry a single-line `$localize` with its `@@id`.
 */

/** The site navigation: breadcrumb roots, and the web app manifest shortcuts. */
export const NAV = {
  home: $localize`:@@nav.home:Home`,
  browse: $localize`:@@nav.browse:Browse`,
  exercises: $localize`:@@nav.exercises:Exercises`
} as const;

/** The installable app (web app manifest). */
export const APP_MANIFEST = {
  name: $localize`:@@manifest.name:PianoML: Learn Piano`,
  shortName: $localize`:@@manifest.shortName:PianoML`,
  description: $localize`:@@manifest.description:Learn piano with smart sheet music, scales and real-time feedback.`
} as const;
