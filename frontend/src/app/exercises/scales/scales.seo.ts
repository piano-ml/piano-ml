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
    title = $localize`:@@seo.scale.exercise.title:${selectedKey}:key: ${scaleName}:scale: Scale: ${exerciseName}:exercise:`;
    description = $localize`:@@seo.scale.exercise.description:Practice the ${selectedKey}:key: ${scaleName}:scale: scale with the ${exerciseName}:exercise: exercise: hands-separated practice, adjustable tempo and real-time MIDI feedback.`;
    canonical = `${EXERCISES_PATH}/${selectedKey}/${state.scaleKey}/${state.exerciseKey}`;
  } else if (scaleName && selectedKey) {
    title = $localize`:@@seo.scale.title:${selectedKey}:key: ${scaleName}:scale: Scale: Piano Exercises`;
    description = $localize`:@@seo.scale.description:Learn the ${selectedKey}:key: ${scaleName}:scale: scale on PianoML with interactive exercises, hands-separated practice and adjustable tempo.`;
    canonical = `${EXERCISES_PATH}/${selectedKey}/${state.scaleKey}`;
  } else {
    title = $localize`:@@seo.scales.title:Piano Scale Exercises: Major & Minor Scales`;
    description = $localize`:@@seo.scales.description:Practice major and minor piano scales with interactive exercises — contrary motion, parallel motion in octaves, thirds, sixths and tenths — at your own tempo.`;
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
      educationalLevel: $localize`:@@seo.exercises.level:Beginner to Advanced`,
      about: {
        '@type': 'Thing',
        name: $localize`:@@seo.scales.about.name:Piano Scales`,
        description: $localize`:@@seo.scales.about.description:Musical scales for piano practice and technique development`
      }
    }
  };
}
