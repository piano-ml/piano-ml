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
    title = `${exerciseName}: ${selectedKey} ${chordName}`;
    description = `Practice piano agility with the ${selectedKey} ${chordName} chord in the ${exerciseName} pattern. Build technique with interactive exercises and real-time feedback.`;
    canonical = `${EXERCISES_PATH}/${selectedKey}/${state.chordKey}/${state.exerciseKey}`;
    teaches = `Piano agility using the ${selectedKey} ${chordName} chord in the ${exerciseName} pattern`;
  } else if (chordName && selectedKey) {
    title = `${selectedKey} ${chordName} Chord: Piano Agility Exercises`;
    description = `Practice ${selectedKey} ${chordName} chord progressions with interactive agility exercises. Improve finger dexterity and chord transitions.`;
    canonical = EXERCISES_PATH;
  } else {
    title = 'Piano Agility Exercises: Technique & Finger Dexterity';
    description =
      'Practice piano agility with interactive exercises — arpeggios in root position and inversions, across two octaves and around the circle of fifths.';
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
      educationalLevel: 'Beginner to Advanced',
      ...(teaches ? { teaches } : {}),
      provider: {
        '@type': 'Organization',
        name: SITE.name,
        url: SITE.url
      }
    }
  };
}
