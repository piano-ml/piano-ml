import type { SeoData } from '../../shared/seo';

export interface ScalesSeoState {
  scaleName?: string;
  scaleKey?: string;
  exerciseName?: string;
  exerciseKey?: string;
  selectedKey?: string;
}

const EXERCISES_PATH = '/exercises/scale';

export function buildScalesSeo(state: ScalesSeoState): SeoData {
  const { scaleName, exerciseName, selectedKey } = state;
  let title: string;
  let description: string;
  let canonical: string;

  if (scaleName && selectedKey && exerciseName) {
    title = `${selectedKey} ${scaleName} Scale: ${exerciseName}`;
    description = `Practice the ${selectedKey} ${scaleName} scale with the ${exerciseName} exercise: hands-separated practice, adjustable tempo and real-time MIDI feedback.`;
    canonical = `${EXERCISES_PATH}/${selectedKey}/${state.scaleKey}/${state.exerciseKey}`;
  } else if (scaleName && selectedKey) {
    title = `${selectedKey} ${scaleName} Scale: Piano Exercises`;
    description = `Learn the ${selectedKey} ${scaleName} scale on PianoML with interactive exercises, hands-separated practice and adjustable tempo.`;
    canonical = `${EXERCISES_PATH}/${selectedKey}/${state.scaleKey}`;
  } else {
    title = 'Piano Scale Exercises: Major & Minor Scales';
    description =
      'Practice major and minor piano scales with interactive exercises — contrary motion, parallel motion in octaves, thirds, sixths and tenths — at your own tempo.';
    canonical = EXERCISES_PATH;
  }

  return {
    title,
    description,
    canonical,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: title,
      description,
      learningResourceType: 'Interactive Exercise',
      educationalLevel: 'Beginner to Advanced',
      about: {
        '@type': 'Thing',
        name: 'Piano Scales',
        description: 'Musical scales for piano practice and technique development'
      }
    }
  };
}
