import { Injectable } from '@angular/core';
import { PlayerStateService } from './player-state.service';
import {
  AlignmentType,
  MusicPartManagerIterator,
  RepetitionInstruction,
  RepetitionInstructionEnum,
  Note as OSMDNote
} from 'opensheetmusicdisplay';


/**
 * Service responsible for managing repetitions and navigation in the score
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerRepetitionService {
  private passCount = 1;
  private repetitionInstructions: RepetitionInstruction[] = [];

  // Cache for measure boundary detection
  private previousMeasureIndex = -1;
  private isAtMeasureStart = false;
  private isAtMeasureEnd = false;

  // Track which repetitions have been taken (measure number -> pass count)
  private repetitionPasses = new Map<number, number>();

  constructor(
    private state: PlayerStateService
  ) { }

  /**
   * Reset the repetition state
   */
  reset(): void {
    this.passCount = 1;
    this.repetitionPasses.clear();
    this.repetitionInstructions = [];
    this.previousMeasureIndex = -1;
    this.isAtMeasureStart = false;
    this.isAtMeasureEnd = false;
  }

  /**
   * Hydrate repetition instructions from the OSMD score
   */
  hydrateRepetitionInstructions(): void {
    this.repetitionInstructions = [];
    const cursor = this.state.osmdCursor;

    while (!cursor.iterator.EndReached) {
      const m = cursor.iterator.CurrentMeasure;

      if (m.FirstRepetitionInstructions.length > 0) {
        for (const instr of m.FirstRepetitionInstructions) {
          this.repetitionInstructions.push(instr);
        }
      }

      if (m.LastRepetitionInstructions.length > 0) {
        for (const instr of m.LastRepetitionInstructions) {
          this.repetitionInstructions.push(instr);
        }
      }
      cursor.iterator.moveToNext();
    }
    // deduplicate this.repetitionInstructions
    this.repetitionInstructions = Array.from(
      new Map(this.repetitionInstructions.map(instr => [instr, instr])).values()
    );
    // Log all relevant repetition instructions
    this.repetitionInstructions.forEach(instr => {
      console.log(instr);
    });
  }

  /**
   * Move the cursor back to a specific measure
   */
  private backToMeasure(measureIndex: number): void {
    const cursor = this.state.osmdCursor;

    while (cursor.iterator.CurrentMeasure.measureListIndex > measureIndex && !cursor.iterator.FrontReached) {
      cursor.previousMeasure();
    }
    setTimeout(() => {
      cursor.previous();
    }, 0);
  }

  /**
   * Move the cursor forward to a specific measure
   */
  private nextToMeasure(measureIndex: number): void {
    const cursor = this.state.osmdCursor;
    while (cursor.iterator.CurrentMeasure.measureListIndex < measureIndex + 1 && !cursor.iterator.EndReached) {
      cursor.nextMeasure();
    }
  }

  isSkipable(n: OSMDNote): unknown {
    return n.isRest()
      || (n.NoteTie && n.NoteTie?.Notes.at(0)?.NoteToGraphicalNoteObjectId !== n.NoteToGraphicalNoteObjectId)
      || n.IsCueNote
  }

  /**
   * Update measure boundary flags efficiently
   */
  private updateMeasureBoundaries(): void {
    const cursor = this.state.osmdCursor;
    const iterator = cursor.iterator;
    const currentMeasure = iterator.CurrentMeasure.measureListIndex;

    // Check if we're at the start of a measure
    this.isAtMeasureStart = currentMeasure > this.previousMeasureIndex;

    // Check if we're at the end of a measure (need to peek ahead)
    if (iterator.EndReached) {
      this.isAtMeasureEnd = true;
    } else {
      cursor.next();
      const nextMeasure = iterator.CurrentMeasure.measureListIndex;
      this.isAtMeasureEnd = currentMeasure < nextMeasure || iterator.EndReached;
      cursor.previous();
    }

    // Update cache for next iteration
    this.previousMeasureIndex = currentMeasure;
  }

  /**
   * Handle movement at the beginning of a measure (voltas)
   */
  private maybeMoveToMeasureOnBegin(iterator: MusicPartManagerIterator): boolean {
    const currentMeasureNumber = iterator.CurrentMeasure.measureListIndex;
    // Check if this measure is a volta that we should skip
    const currentVoltaStart = this.repetitionInstructions.find(
      instr =>
        instr.type === RepetitionInstructionEnum.Ending
        && instr.alignment === AlignmentType.Begin
        && !instr.endingIndices.includes(this.passCount)
        && currentMeasureNumber === instr.measureIndex
    );

    if (currentVoltaStart) {
      const currentVoltaEnd = this.repetitionInstructions.find(
        instr =>
          instr.type === RepetitionInstructionEnum.Ending
          && instr.alignment === AlignmentType.End
          && instr.endingIndices.includes(currentVoltaStart.endingIndices[0]) // todo better than [0] ?
      );
      this.nextToMeasure(currentVoltaEnd!.measureIndex);
      return true;
    }
    return false;
  }

  /**
   * Handle movement at the end of a measure (back jumps)
   */
  private maybeMoveToMeasureOnEnd(iterator: MusicPartManagerIterator): boolean {
    const currentMeasureNumber = iterator.CurrentMeasure.measureListIndex;
    // Check if there's a BackJumpLine at the END of this measure
    const backJump = this.repetitionInstructions.find(
      instr =>
        instr.type === RepetitionInstructionEnum.BackJumpLine &&
        instr.measureIndex === currentMeasureNumber &&
        instr.alignment === AlignmentType.End
    );

    if (backJump) {
      console.log('BackJumpLine found at measure', currentMeasureNumber,'- pass count:', this.passCount);
      // Find the corresponding StartLine at the BEGIN
      const startLine = this.repetitionInstructions.find(
        instr =>
          instr.type === RepetitionInstructionEnum.StartLine &&
          instr.measureIndex < currentMeasureNumber
      );

      const targetMeasure = startLine ? startLine.measureIndex : 0;

      // Get all endings to determine if we should continue repeating
      const allEndings = this.repetitionInstructions
        .filter(instr => instr.type === RepetitionInstructionEnum.Ending)
        .sort((a, b) => a.measureIndex - b.measureIndex);

      let maxEndingNumber: number;

      if (allEndings.length > 0) {
        // Cas avec voltas : nombre de passes = max numéro de volta
        maxEndingNumber = Math.max(
          ...allEndings.flatMap(e => e.endingIndices || [1])
        );
      } else {
        // Cas sans Ending : simple reprise -> 2 passages
        maxEndingNumber = 2;
      }

      // Si on n'a pas encore atteint le nombre de passages, on saute en arrière
      if (this.passCount < maxEndingNumber) {
        this.backToMeasure(targetMeasure);
        this.passCount++;
        return true;
      } else {
        this.passCount = 1; // Reset for future repetitions
      }
    }
    return false;
  }

  /**
   * Handle potential measure movement (repetitions)
   */
  maybeMoveToMeasure(iterator: MusicPartManagerIterator): void {
    // Update boundaries once per call
    this.updateMeasureBoundaries();

    // ✅ First handle backjumps (end of measure)
    if (this.isAtMeasureEnd) {
      const didBackJump = this.maybeMoveToMeasureOnEnd(iterator);
      if (didBackJump) {
        return; // ✅ Don't process voltas if we just did a backjump
      }
    }

    // ✅ Then handle voltas (beginning of measure)
    if (this.isAtMeasureStart) {
      this.maybeMoveToMeasureOnBegin(iterator);
    }
  }


}