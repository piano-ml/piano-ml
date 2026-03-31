import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { exercises as agilityExercises } from '../../../exercises/agility/pattern';
import { exercises as scalesExercises } from '../../../exercises/scales/pattern';
import { Exercise } from '../../../exercises/model';

interface ExerciseWithType extends Exercise {
  exerciseType: 'agility' | 'scale';
}

@Component({
  selector: 'app-exercises-in-key',
  imports: [CommonModule],
  templateUrl: './exercises-in-key.component.html',
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
      
      return `/exercises/agility/${selectedKey}/${chordKey}/${exercise.key}`;
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
      
      return `/exercises/scale/${selectedKey}/${scaleKey}/${exercise.key}`;
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
    return type === 'agility' ? 'Agility' : 'Scales';
  }
}
