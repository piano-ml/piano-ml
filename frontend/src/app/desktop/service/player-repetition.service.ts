import { Injectable } from '@angular/core';
import { PlayerStateService } from './player-state.service';
import { 
  AlignmentType, 
  MusicPartManagerIterator, 
  RepetitionInstruction, 
  RepetitionInstructionEnum 
} from 'opensheetmusicdisplay';

/**
 * Service responsable de la gestion des répétitions et de la navigation dans la partition
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerRepetitionService {
  private passCount = 1;
  private repetitionInstructions = new Set<RepetitionInstruction>();
  
  // Track which repetitions have been taken (measure number -> pass count)
  private repetitionPasses = new Map<number, number>();

  constructor(private state: PlayerStateService) {}

  /**
   * Réinitialise l'état des répétitions
   */
  reset(): void {
    this.passCount = 1;
    this.repetitionPasses.clear();
    this.repetitionInstructions.clear();
  }

  /**
   * Hydrate les instructions de répétition depuis la partition OSMD
   */
  hydrateRepetitionInstructions(): void {
    this.repetitionInstructions.clear();
    const cursor = this.state.osmdCursor;
    
    while (!cursor.iterator.EndReached) {
      const m = cursor.iterator.CurrentMeasure;
      
      if (m.FirstRepetitionInstructions.length > 0) {
        for (const instr of m.FirstRepetitionInstructions) {
          this.repetitionInstructions.add(instr);
        }
      }
      
      if (m.LastRepetitionInstructions.length > 0) {
        for (const instr of m.LastRepetitionInstructions) {
          this.repetitionInstructions.add(instr);
        }
      }
      
      cursor.iterator.moveToNext();
    }
    
    // Log all relevant repetition instructions
    Array.from(this.repetitionInstructions).forEach(instr => {
      console.log(instr);
    });
  }

  /**
   * Retourne au curseur à une mesure spécifique
   */
  private backToMeasure(measureIndex: number): void {
    console.log("BACK TO MEASURE", measureIndex);
    const cursor = this.state.osmdCursor;
    
    while (cursor.iterator.CurrentMeasure.MeasureNumber > measureIndex + 1) {
      cursor.previousMeasure();
    }

    setTimeout(() => {
      cursor.previous();
    }, 0);
  }

  /**
   * Avance le curseur à une mesure spécifique
   */
  private nextToMeasure(measureIndex: number): void {
    console.log("FORWARD TO MEASURE", measureIndex);
    const cursor = this.state.osmdCursor;
    
    while (cursor.iterator.CurrentMeasure.MeasureNumber < measureIndex + 1) {
      cursor.nextMeasure();
    }
  }

  /**
   * Vérifie si on est à la première note d'une mesure
   */
  isFirstNoteOfMeasure(iterator: MusicPartManagerIterator): boolean {
    const cursor = this.state.osmdCursor;
    const currentMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
    cursor.previous();
    const previousMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
    cursor.next();
    return currentMeasure > previousMeasure;
  }

  /**
   * Vérifie si on est à la dernière note d'une mesure
   */
  isLastNoteOfMeasure(iterator: MusicPartManagerIterator): boolean {
    const cursor = this.state.osmdCursor;
    const currentMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
    cursor.next();
    const nextMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
    const result = currentMeasure < nextMeasure || cursor.iterator.EndReached;
    cursor.previous();
    return result;
  }

  /**
   * Gère le déplacement au début d'une mesure (voltas)
   */
  private maybeMoveToMeasureOnBegin(iterator: MusicPartManagerIterator): boolean {
    const currentMeasureNumber = iterator.CurrentMeasure.MeasureNumber - 1;
    
    console.log("first note of measure", currentMeasureNumber, "pass:", this.passCount);
    
    // Check if this measure is an ending that we should skip
    const currentEnding = Array.from(this.repetitionInstructions).find(
      instr =>
        instr.type === RepetitionInstructionEnum.Ending 
        && !instr.endingIndices.includes(this.passCount)
        && (currentMeasureNumber >= instr.measureIndex && currentMeasureNumber <= instr.measureIndex) 
    );

    if (currentEnding) {
      console.log("goto skip volta at measure", currentMeasureNumber, "pass:", this.passCount);
      console.log(currentEnding);
      this.nextToMeasure(currentEnding.measureIndex + 1);
      this.maybeMoveToMeasure(iterator);
      return true;
    }
    return false;
  }

  /**
   * Gère le déplacement à la fin d'une mesure (back jumps)
   */
  private maybeMoveToMeasureOnEnd(iterator: MusicPartManagerIterator): void {
    const currentMeasureNumber = iterator.CurrentMeasure.MeasureNumber - 1;
    console.log("last note of measure", currentMeasureNumber, "pass:", this.passCount);
    
    // Check if there's a BackJumpLine at the END of this measure
    const backJump = Array.from(this.repetitionInstructions).find(
      instr =>
        instr.type === RepetitionInstructionEnum.BackJumpLine &&
        instr.measureIndex === currentMeasureNumber &&
        instr.alignment === AlignmentType.End
    );

    if (backJump) {
      console.log(`BackJump found at end of measure ${currentMeasureNumber}, pass: ${this.passCount}`);
      
      // Find the corresponding StartLine at the BEGIN
      const startLine = Array.from(this.repetitionInstructions).find(
        instr =>
          instr.type === RepetitionInstructionEnum.StartLine &&
          instr.measureIndex < currentMeasureNumber
      );

      const targetMeasure = startLine ? startLine.measureIndex : 0;
      
      // Check if this is the last ending
      const currentEnding = Array.from(this.repetitionInstructions).find(
        instr =>
          instr.type === RepetitionInstructionEnum.Ending &&
          instr.measureIndex === currentMeasureNumber &&
          instr.endingIndices?.includes(this.passCount)
      );

      // Get all endings to determine if we should continue repeating
      const allEndings = Array.from(this.repetitionInstructions)
        .filter(instr => instr.type === RepetitionInstructionEnum.Ending)
        .sort((a, b) => a.measureIndex - b.measureIndex);
      
      const maxEndingNumber = Math.max(
        ...allEndings.flatMap(e => e.endingIndices || [1])
      );

      console.log(`Current ending: ${currentEnding?.endingIndices}, max ending: ${maxEndingNumber}, passCount: ${this.passCount}`);

      // If we haven't reached the last ending yet, jump back
      if (this.passCount <= maxEndingNumber) {
        console.log(`Jumping back to measure ${targetMeasure}, next pass will be ${this.passCount + 1}`);
        this.backToMeasure(targetMeasure);
        this.passCount++;
      } else {
        console.log(`Last ending reached (${this.passCount}), continuing forward`);
        // Continue normally after the last ending
      }
    }
  }

  /**
   * Gère potentiellement le déplacement de mesure (répétitions)
   */
  maybeMoveToMeasure(iterator: MusicPartManagerIterator): void {
    let onVolta = false;
    
    // At the BEGIN of a measure
    if (this.isFirstNoteOfMeasure(iterator)) {
      onVolta = this.maybeMoveToMeasureOnBegin(iterator);
    }
    
    // At the END of a measure
    if (!onVolta && this.isLastNoteOfMeasure(iterator)) {
      this.maybeMoveToMeasureOnEnd(iterator);
    }
  }
}
