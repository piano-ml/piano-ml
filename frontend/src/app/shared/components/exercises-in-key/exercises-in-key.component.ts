import { Component, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';

import { exercises as agilityExercises } from '../../../exercises/agility/pattern';
import { exercises as scalesExercises } from '../../../exercises/scales/pattern';
import { Exercise } from '../../../exercises/model';
import { keyName, localizedPath, parseKey } from '../../i18n';

interface ExerciseWithType extends Exercise {
  exerciseType: 'agility' | 'scale';
}

/**
 * A key as stored ("f# minor", "B- major") written for people in the page language ("F♯ minor", "Fa♯ menor",
 * "B-Dur"); "this key" when it is not a major or minor key.
 */
export function formatKeyLabel(fullKey: string | null | undefined): string {
  return parseKey(fullKey)?.mode ? keyName(fullKey) : $localize`:@@exercisesInKey.thisKey:this key`;
}

@Component({
  selector: 'app-exercises-in-key',
  imports: [],
  templateUrl: './exercises-in-key.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './exercises-in-key.component.css'
})
export class ExercisesInKeyComponent implements OnChanges {
  @Input() fullKey!: string;

  exercises: ExerciseWithType[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    this.loadExercises();
  }

  loadExercises(): void {
    if (!this.fullKey) {
      console.log('No fullKey provided for exercises, skipping load.');
      return;
    }

    // Combine both agility and scales exercises
    const agilityWithType: ExerciseWithType[] = agilityExercises.map(ex => ({
      ...ex,
      exerciseType: 'agility' as const
    }));

    const scalesWithType: ExerciseWithType[] = scalesExercises.map(ex => ({
      ...ex,
      exerciseType: 'scale' as const
    }));

    this.exercises = [...agilityWithType, ...scalesWithType];
  }

  /** The key for people, in the page language; "this key" when it cannot be read. */
  get keyLabel(): string {
    return formatKeyLabel(this.fullKey);
  }

  getExerciseUrl(exercise: ExerciseWithType): string {
    if (!exercise.key) {
      return '#';
    }

    // Parse fullKey to extract key and determine if major/minor
    const parts = this.fullKey.trim().split(' ');
    if (parts.length < 2) {
      return '#';
    }

    const note = parts[0]; // e.g., "C#", "b-", "A"
    const scaleType = parts[1]; // "major" or "minor"

    if (exercise.exerciseType === 'agility') {
      // For agility: /exercises/agility/:selectedKey/:chordKey/:exerciseKey
      // Determine chord type from scale type
      const chordKey = scaleType.toLowerCase() === 'minor' ? 'minor' : 'major';
      // For agility, always use uppercase first letter and remove 'm' suffix (e.g., Bb, C#, A)
      const selectedKey = this.convertNoteForRoute(note, true, true);
      
      // Plain links: localizedPath keeps them in the page's language (/es/exercises/...).
      return localizedPath(`/exercises/agility/${selectedKey}/${chordKey}/${exercise.key}`);
    } else {
      // For scales: /exercises/scale/:selectedKey/:scaleKey/:exerciseKey
      // scaleKey is just "major" or "minor"
      const scaleKey = scaleType.toLowerCase();
      const isMinor = scaleKey === 'minor';
      // For scales, always uppercase first letter
      let selectedKey = this.convertNoteForRoute(note, true, false);
      
      // Add 'm' suffix for minor keys if not already present
      if (isMinor && !selectedKey.endsWith('m')) {
        selectedKey += 'm';
      }
      
      return localizedPath(`/exercises/scale/${selectedKey}/${scaleKey}/${exercise.key}`);
    }
  }

  private convertNoteForRoute(note: string, forceUpperCase: boolean, removeMinorSuffix: boolean): string {
    // Convert from display format to route format
    // Replace '-' with 'b' for flats (e.g., "B-" -> "Bb", "b-" -> "bb")
    let converted = note.replace(/-/g, 'b');
    
    // Remove trailing 'm' if requested (for agility routes)
    if (removeMinorSuffix && converted.endsWith('m')) {
      converted = converted.slice(0, -1);
    }
    
    // If forceUpperCase is true (for agility), ensure first letter is uppercase
    if (forceUpperCase && converted.length > 0) {
      converted = converted.charAt(0).toUpperCase() + converted.slice(1);
    }
    
    // Encode sharp (#) for URL
    converted = converted.replace(/#/g, '%23');
    
    return converted;
  }

  getExerciseTypeLabel(type: 'agility' | 'scale'): string {
    return type === 'agility' ? $localize`:@@exercisesInKey.agility:Agility` : $localize`:@@exercisesInKey.scales:Scales`;
  }
}
