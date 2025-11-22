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
  private repetitionInstructions = new Set<RepetitionInstruction>();

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
    this.repetitionInstructions.clear();
  }

  /**
   * Hydrate repetition instructions from the OSMD score
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
   * Check if we are at the first note of a measure
   */
  isFirstNoteOfMeasure(iterator: MusicPartManagerIterator): boolean {
    const cursor = this.state.osmdCursor;
    const currentMeasure = cursor.iterator.CurrentMeasure.measureListIndex;
    cursor.previous();
    const previousMeasure = cursor.iterator.CurrentMeasure.measureListIndex;
    cursor.next();
    return currentMeasure > previousMeasure;
  }

  /**
   * Check if we are at the last note of a measure
   */
  isLastNoteOfMeasure(iterator: MusicPartManagerIterator): boolean {
    const cursor = this.state.osmdCursor;
    const currentMeasure = cursor.iterator.CurrentMeasure.measureListIndex;
    cursor.next();
    const nextMeasure = cursor.iterator.CurrentMeasure.measureListIndex;
    const result = currentMeasure < nextMeasure || cursor.iterator.EndReached;
    cursor.previous();
    return result;
  }

  /**
   * Handle movement at the beginning of a measure (voltas)
   */
  private maybeMoveToMeasureOnBegin(iterator: MusicPartManagerIterator): boolean {
    const currentMeasureNumber = iterator.CurrentMeasure.measureListIndex;
    // Check if this measure is a volta that we should skip
    const currentVoltaStart = Array.from(this.repetitionInstructions).find(
      instr =>
        instr.type === RepetitionInstructionEnum.Ending
        && instr.alignment === AlignmentType.Begin
        && !instr.endingIndices.includes(this.passCount)
        && currentMeasureNumber === instr.measureIndex
    );

    if (currentVoltaStart) {
      const currentVoltaEnd = Array.from(this.repetitionInstructions).find(
        instr =>
          instr.type === RepetitionInstructionEnum.Ending
          && instr.alignment === AlignmentType.End
          && instr.endingIndices.includes(currentVoltaStart.endingIndices[0]) // todo better than [0] ?
      );
      console.log("skip volta at measure", currentMeasureNumber, "to: ", currentVoltaEnd!.measureIndex, "pass:", this.passCount);
      console.log(currentVoltaStart);
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
    const backJump = Array.from(this.repetitionInstructions).find(
      instr =>
        instr.type === RepetitionInstructionEnum.BackJumpLine &&
        instr.measureIndex === currentMeasureNumber &&
        instr.alignment === AlignmentType.End
    );

    if (backJump) {
      // Find the corresponding StartLine at the BEGIN
      const startLine = Array.from(this.repetitionInstructions).find(
        instr =>
          instr.type === RepetitionInstructionEnum.StartLine &&
          instr.measureIndex < currentMeasureNumber
      );

      const targetMeasure = startLine ? startLine.measureIndex : 0;
      // Check if this is the last ending


      // Get all endings to determine if we should continue repeating
      const allEndings = Array.from(this.repetitionInstructions)
        .filter(instr => instr.type === RepetitionInstructionEnum.Ending)
        .sort((a, b) => a.measureIndex - b.measureIndex);

      const maxEndingNumber = Math.max(
        ...allEndings.flatMap(e => e.endingIndices || [1])
      );
      // If we haven't reached the last ending yet, jump back
      if (this.passCount <= maxEndingNumber) {
        this.backToMeasure(targetMeasure);
        this.passCount++;
        return true;
      } else {
        //console.log(`Last ending reached (${this.passCount}), continuing forward`);
        // Continue normally after the last ending
      }

    }
    return false;
  }

  /**
   * Handle potential measure movement (repetitions)
   */
  maybeMoveToMeasure(iterator: MusicPartManagerIterator): void {
    // ✅ First handle backjumps (end of measure)
    if (this.isLastNoteOfMeasure(iterator)) {
      const didBackJump = this.maybeMoveToMeasureOnEnd(iterator);
      if (didBackJump) {
        return; // ✅ Don't process voltas if we just did a backjump
      }
    }

    // ✅ Then handle voltas (beginning of measure)
    if (this.isFirstNoteOfMeasure(iterator)) {
      this.maybeMoveToMeasureOnBegin(iterator);
    }
  }


}
