import { exercisesPageFor, shouldClearStoredExercise } from './exercise-storage';

describe('exercise-storage', () => {
  it('clears only the exercise the leaving workbench loaded', () => {
    expect(shouldClearStoredExercise('{"a":1}', '{"a":1}')).toBe(true);
    expect(shouldClearStoredExercise('{"a":1}', '{"b":2}')).toBe(false); // written for the next workbench
    expect(shouldClearStoredExercise(null, '{"b":2}')).toBe(false);      // a score page loaded no exercise
    expect(shouldClearStoredExercise('{"a":1}', null)).toBe(false);
  });

  it('maps a workbench exercise URL to its exercises page, swapping the parameters', () => {
    expect(exercisesPageFor('/workbench/scale/major/Eb/left_than_right?useMetronome=true'))
      .toEqual(['/', 'exercises', 'scale', 'Eb', 'major', 'left_than_right']);
    expect(exercisesPageFor('/workbench/agility/maj7/C/arpeggio'))
      .toEqual(['/', 'exercises', 'agility', 'C', 'maj7', 'arpeggio']);
    expect(exercisesPageFor('/workbench/scale/major')).toEqual(['/', 'exercises']);
    expect(exercisesPageFor('/work/some-score')).toEqual(['/', 'exercises']);
  });
});
