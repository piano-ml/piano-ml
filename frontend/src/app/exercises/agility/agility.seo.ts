import { localizedUrl } from '../../shared/i18n';
import { SITE, type SeoData } from '../../shared/seo';

export interface AgilitySeoState {
  chordName?: string;
  chordKey?: string;
  exerciseName?: string;
  exerciseKey?: string;
  selectedKey?: string;
}

const EXERCISES_PATH = '/exercises/agility';

export function buildAgilitySeo(state: AgilitySeoState): SeoData {
  const { chordName, exerciseName, selectedKey } = state;
  let title: string;
  let description: string;
  let canonical: string;
  let teaches: string | undefined;

  if (chordName && selectedKey && exerciseName) {
    title = $localize`:@@seo.agility.exercise.title:${exerciseName}:exercise:: ${selectedKey}:key: ${chordName}:chord:`;
    description = $localize`:@@seo.agility.exercise.description:Practice piano agility with the ${selectedKey}:key: ${chordName}:chord: chord in the ${exerciseName}:exercise: pattern. Build technique with interactive exercises and real-time feedback.`;
    canonical = `${EXERCISES_PATH}/${selectedKey}/${state.chordKey}/${state.exerciseKey}`;
    teaches = $localize`:@@seo.agility.exercise.teaches:Piano agility using the ${selectedKey}:key: ${chordName}:chord: chord in the ${exerciseName}:exercise: pattern`;
  } else if (chordName && selectedKey) {
    title = $localize`:@@seo.agility.chord.title:${selectedKey}:key: ${chordName}:chord: Chord: Piano Agility Exercises`;
    description = $localize`:@@seo.agility.chord.description:Practice ${selectedKey}:key: ${chordName}:chord: chord progressions with interactive agility exercises. Improve finger dexterity and chord transitions.`;
    canonical = EXERCISES_PATH;
  } else {
    title = $localize`:@@seo.agility.title:Piano Agility Exercises: Technique & Finger Dexterity`;
    description = $localize`:@@seo.agility.description:Practice piano agility with interactive exercises — arpeggios in root position and inversions, across two octaves and around the circle of fifths.`;
    canonical = EXERCISES_PATH;
  }

  return {
    title,
    description,
    canonical,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: title,
      description,
      educationalLevel: $localize`:@@seo.exercises.level:Beginner to Advanced`,
      ...(teaches ? { teaches } : {}),
      provider: {
        '@type': 'Organization',
        name: SITE.name,
        url: localizedUrl('/')
      }
    }
  };
}
