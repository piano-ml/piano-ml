import { Injectable } from '@angular/core';
import { PlayerStateService } from './player-state.service';
import {
  AlignmentType,
  MusicPartManagerIterator,
  RepetitionInstruction,
  RepetitionInstructionEnum,
  Note as OSMDNote
} from 'opensheetmusicdisplay';
import { PlayerService } from './player.service';


/**
 * Service responsible for managing repetitions and navigation in the score
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerRepetitionService {
  private passCount = 1;
  private repetitionInstructions: RepetitionInstruction[] = [];

  /**
   * When we take a back-jump repeat, we keep an "active" repeat anchor so that
   * we can reset passCount after playing the last ending, even if the last pass
   * does not land on the BackJumpLine measure.
   */
  private activeRepeatAnchorMeasureIndex: number | null = null;
  private activeRepeatMaxEndingNumber: number | null = null;

  // Cache for measure boundary detection
  private previousMeasureIndex = -1;
  private isAtMeasureStart = false;
  private isAtMeasureEnd = false;

  // Track which repetitions have been taken (measure number -> pass count)
  private repetitionPasses = new Map<number, number>();

  // Last Segno (repetition marker) measure index, if any
  private segnoMeasureIndex: number | null = null;

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
    this.segnoMeasureIndex = null;
    this.activeRepeatAnchorMeasureIndex = null;
    this.activeRepeatMaxEndingNumber = null;
  }

  private getRepeatAnchorForMeasure(measureIndex: number): number | null {
    const anchor = this.repetitionInstructions
      .filter(
        instr =>
          instr.type === RepetitionInstructionEnum.BackJumpLine &&
          instr.alignment === AlignmentType.End &&
          instr.measureIndex <= measureIndex
      )
      .sort((a, b) => b.measureIndex - a.measureIndex)[0];

    return anchor ? anchor.measureIndex : null;
  }

  private getMaxEndingNumberForAnchor(anchorMeasureIndex: number): number {
    const anchoredEndings = this.repetitionInstructions
      .filter(instr => instr.type === RepetitionInstructionEnum.Ending)
      .filter(instr => this.getRepeatAnchorForMeasure(instr.measureIndex) === anchorMeasureIndex);

    if (anchoredEndings.length === 0) {
      // No explicit Ending instructions anchored to this repeat -> default to 2 passes
      return 2;
    }

    return Math.max(
      ...anchoredEndings.flatMap(e => e.endingIndices || [1])
    );
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

    // Track the last Segno instruction, if any
    const segnos = this.repetitionInstructions
      .filter(instr => instr.type === RepetitionInstructionEnum.Segno)
      .sort((a, b) => a.measureIndex - b.measureIndex);

    this.segnoMeasureIndex = segnos.length > 0
      ? segnos[segnos.length - 1].measureIndex
      : null;

    // Log all relevant repetition instructions
    this.repetitionInstructions.forEach(instr => {
      console.log(instr);
    });
  }

  /**
   * Jump back to the last Segno marker (if present)
   */
  private jumpToSegno(playerService: PlayerService): boolean {
    if (this.segnoMeasureIndex != null) {
      this.backToMeasure(this.segnoMeasureIndex, playerService);
      this.passCount = 1;
      return true;
    }
    return false;
  }

  /**
   * Move the cursor back to a specific measure
   */
  private backToMeasure(measureIndex: number, playerService: PlayerService): void {
    playerService.pause();
    const cursor = this.state.osmdCursor;
    let doPrevious = true;
    if (cursor.NotesUnderCursor().every(n => this.isSkipable(n))) {
      doPrevious = false;
    }
    while (cursor.iterator.CurrentMeasure.measureListIndex > measureIndex && !cursor.iterator.FrontReached) {
      console.log("previous measure1");
      cursor.previousMeasure();
    }

    setTimeout(() => {
      if (doPrevious) {
        console.log("previous cursor2");
        cursor.previous();
      }
      playerService.play(playerService.playConfiguration);
    }, 0);
  }

  /**
   * Move the cursor forward to a specific measure
   */
  private nextToMeasure(measureIndex: number): void {
    //console.log(`Next to measure ${measureIndex}`);
    const cursor = this.state.osmdCursor;
    while (cursor.iterator.CurrentMeasure.measureListIndex < measureIndex  && !cursor.iterator.EndReached) {
      console.log(`Next to measure ${cursor.iterator.CurrentMeasure.measureListIndex} --> ${measureIndex}`);
      console.log("next measure2");
      cursor.nextMeasure();

    }
    // if (cursor.iterator.CurrentMeasure.measureListIndex == measureIndex + 1) {
    //   cursor.previous();
    // }
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
      const anchor = this.getRepeatAnchorForMeasure(currentVoltaStart.measureIndex);
      const currentVoltaEnd = this.repetitionInstructions.find(
        instr =>
          instr.type === RepetitionInstructionEnum.Ending
          && instr.alignment === AlignmentType.End
          && instr.endingIndices.includes(currentVoltaStart.endingIndices[0]) // todo better than [0] ?
          && (anchor == null || this.getRepeatAnchorForMeasure(instr.measureIndex) === anchor)
      );
      // Move to the first measure AFTER the ending.
      // (Jumping to the ending end measure itself is a no-op when we're already on it.)
      this.nextToMeasure((currentVoltaEnd?.measureIndex ?? currentVoltaStart.measureIndex) + 1);
      return true;
    }
    return false;
  }

  /**
   * Handle movement at the end of a measure (back jumps)
   */
  private maybeMoveToMeasureOnEnd(iterator: MusicPartManagerIterator, playerService: PlayerService): boolean {
    const currentMeasureNumber = iterator.CurrentMeasure.measureListIndex;

    // If we're on the last pass of an active repeat, reset passCount when we reach
    // the end of the last ending (this often happens on a measure that is NOT the backjump sign).
    if (
      this.activeRepeatAnchorMeasureIndex != null &&
      this.activeRepeatMaxEndingNumber != null &&
      this.passCount === this.activeRepeatMaxEndingNumber
    ) {
      const endingEnd = this.repetitionInstructions.find(
        instr =>
          instr.type === RepetitionInstructionEnum.Ending &&
          instr.alignment === AlignmentType.End &&
          instr.measureIndex === currentMeasureNumber &&
          (instr.endingIndices || []).includes(this.passCount) &&
          this.getRepeatAnchorForMeasure(instr.measureIndex) === this.activeRepeatAnchorMeasureIndex
      );

      if (endingEnd) {
        this.passCount = 1;
        this.activeRepeatAnchorMeasureIndex = null;
        this.activeRepeatMaxEndingNumber = null;
      }
    }

    // Special cases: Da Capo / Dal Segno instructions at measure end
    const daCapoLike = this.repetitionInstructions.find(
      instr =>
        (instr.type === RepetitionInstructionEnum.DaCapo
          || instr.type === RepetitionInstructionEnum.DaCapoAlFine
          || instr.type === RepetitionInstructionEnum.DaCapoAlCoda) &&
        instr.measureIndex === currentMeasureNumber &&
        instr.alignment === AlignmentType.End
    );

    if (daCapoLike) {
      // Simple Da Capo behavior: jump back to the beginning of the score
      this.backToMeasure(0, playerService);
      this.passCount = 1;
      return true;
    }

    const dalSegnoLike = this.repetitionInstructions.find(
      instr =>
        (instr.type === RepetitionInstructionEnum.DalSegno
          || instr.type === RepetitionInstructionEnum.DalSegnoAlFine
          || instr.type === RepetitionInstructionEnum.DalSegnoAlCoda) &&
        instr.measureIndex === currentMeasureNumber &&
        instr.alignment === AlignmentType.End
    );

    if (dalSegnoLike) {
      // Dal Segno behavior: jump back to last Segno marker if available
      if (this.jumpToSegno(playerService)) {
        return true;
      }
    }
    // Check if there's a BackJumpLine at the END of this measure
    const backJump = this.repetitionInstructions.find(
      instr =>
        instr.type === RepetitionInstructionEnum.BackJumpLine &&
        instr.measureIndex === currentMeasureNumber &&
        instr.alignment === AlignmentType.End
    );

    if (!backJump) {
      return false;
    }

    // Find an explicit StartLine before this measure; default to the beginning otherwise
    let targetMeasure = 0;
    const previousStartLine = this.repetitionInstructions
      .filter(
        instr =>
          instr.type === RepetitionInstructionEnum.StartLine &&
          instr.measureIndex < currentMeasureNumber
      )
      .sort((a, b) => b.measureIndex - a.measureIndex)[0];

    if (previousStartLine) {
      // Resume from the beginning of this repeat section
      targetMeasure = previousStartLine.measureIndex;
    }

    const anchorMeasureIndex = backJump.measureIndex;
    const maxEndingNumber = this.getMaxEndingNumberForAnchor(anchorMeasureIndex);

    this.activeRepeatAnchorMeasureIndex = anchorMeasureIndex;
    this.activeRepeatMaxEndingNumber = maxEndingNumber;
    //console.log(`BackJump at measure ${currentMeasureNumber}, pass ${this.passCount}/${maxEndingNumber} ${targetMeasure}`);

    if (this.passCount < maxEndingNumber) {
      this.backToMeasure(targetMeasure, playerService);
      this.passCount++;
      return true;
    } else {
      this.passCount = 1; // Reset for future repetitions
      this.activeRepeatAnchorMeasureIndex = null;
      this.activeRepeatMaxEndingNumber = null;
    }

    return false;
  }
  /**
   * Handle potential measure movement (repetitions)
   */
  maybeMoveToMeasure(iterator: MusicPartManagerIterator, playerService: PlayerService): void {
    // Update boundaries once per call
    this.updateMeasureBoundaries();

    // ✅ First handle backjumps (end of measure)
    if (this.isAtMeasureEnd) {
      const didBackJump = this.maybeMoveToMeasureOnEnd(iterator, playerService);
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