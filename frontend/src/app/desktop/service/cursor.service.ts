
import { Injectable, signal, OnDestroy } from "@angular/core";
import { Midi } from "@tonejs/midi";
import type { Note as MidiNote, Note } from "@tonejs/midi/dist/Note";
import { Cursor, Note as OSMDNote, GraphicalNote, VexFlowGraphicalNote, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { CURSOR_GOOD_COLOR } from "../components/osmd/osmd.config";
import { smithWatermanAlign, smithWatermanAlign2 } from "./smith-waterman";
import { CursorAlignmentAlgorithm, OsmdArrayElement } from "../model/model";

/**
 * The view scrolls (to centre the cursor) once the cursor comes within this fraction of the view's height or width
 * from an edge. 0: only once part of it is out of view, so a score that fits never scrolls.
 */
export const CURSOR_FOLLOW_MARGIN = 0;

/**
 * The nearest ancestor that scrolls along `axis`, or null for the page itself. Per axis: the score's own container
 * scrolls sideways only, and is as tall as the score, so the cursor never left it vertically (regression).
 */
function scrollingAncestor(element: HTMLElement, axis: 'x' | 'y'): HTMLElement | null {
    for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(axis === 'y' ? style.overflowY : style.overflowX)) return node;
    }
    return null;
}

/** What the user sees of `scroller` along one axis: its box, clipped to the window. */
function visibleRange(scroller: HTMLElement | null, axis: 'x' | 'y'): [number, number] {
    const windowEnd = axis === 'y' ? window.innerHeight : window.innerWidth;
    if (!scroller) return [0, windowEnd];
    const box = scroller.getBoundingClientRect();
    return axis === 'y'
        ? [Math.max(0, box.top), Math.min(windowEnd, box.bottom)]
        : [Math.max(0, box.left), Math.min(windowEnd, box.right)];
}



@Injectable({
    providedIn: 'root'
})
export class CursorService implements OnDestroy {

    /** Setup gives the UI a turn once it has worked this long without one (a frame at 60 Hz). */
    private static readonly UI_YIELD_AFTER_MS = 16;
    private setupTimeoutId?: ReturnType<typeof setTimeout>;
    private lastYield = 0;
    private alignmentAlgorithm: CursorAlignmentAlgorithm = "sw2";
    private cursorIndex = 0;
    /** Keep the cursor in view while it moves (set from the score's followCursor option, see PlayerService). */
    follow = false;
    /** The scrolling container of the cursor element, found once per element. */
    private scrollerOf?: { element: HTMLElement; x: HTMLElement | null; y: HTMLElement | null };
    private osmdArray: OsmdArrayElement[] | undefined;
    private midiTicksNoteMap: Map<number, MidiNote[]> = new Map();   // ticks => MidiNote[]    
    private osmdCursorIdxToMeasureMap: Map<number, number> = new Map();
    private osmdMeasureSequence: number[] = [];
    public maxMidiMeasure = 0;
    // Signal exposé pour le slop score
    public slopScoreSignal = signal<number>(0);


    cursor: Cursor | undefined;
    /** Measures in the rendered score (0 before one is mapped). */
    osmdMeasureCount = 0;
    feedbackSignal = signal<{ message: string; percentage: number } | null>(null);
    readonly measure = signal<number>(0);
    midiTicksToOsmdCursorIndex: Map<number, { osmdIndex: number, osmdMeasure: number }> = new Map();
    sortedMappedMidiTicks: number[] = [];
    sortedMidiTicks: number[] = [];

    public tiltCursor(cursor: Cursor): void {
        this.cursor = cursor;
    }

    public resetSession(): void {
        if (this.setupTimeoutId) {
            clearTimeout(this.setupTimeoutId);
            this.setupTimeoutId = undefined;
        }

        this.feedbackSignal.set(null);
        this.measure.set(0);
        this.slopScoreSignal.set(0);
        this.cursorIndex = 0;
        this.maxMidiMeasure = 0;
        this.osmdMeasureCount = 0;

        this.midiTicksNoteMap.clear();
        this.osmdCursorIdxToMeasureMap.clear();
        this.midiTicksToOsmdCursorIndex.clear();
        this.osmdMeasureSequence = [];
        this.sortedMappedMidiTicks = [];
        this.sortedMidiTicks = [];

        if (this.osmdArray) {
            this.osmdArray.clear();
            this.osmdArray = undefined;
        }

        this.cursor = undefined;
    }

    public async setup(cursor: Cursor, midi: Midi): Promise<number> {

        this.cursor = cursor;
        this.midiTicksToOsmdCursorIndex.clear();
        this.feedbackSignal.set({ message: $localize`:@@workbench.progress.initializing:Initializing...`, percentage: 0 });
        // The UI gets a turn only once setup has worked a frame's time without one (maybeYieldToUi): a usual
        // score sets up in one go (Diabelli's 298 played measures: about 20 ms), a long one stays responsive
        this.lastYield = performance.now();

        this.buildMidiTicksNoteMap(midi)
        midi = null as any; // free memory
        await this.maybeYieldToUi();

        // One walk in playback order with OSMD's own iterator (CursorIgnoreRepetitions = false): it takes
        // the repeats, voltas, D.C. / D.S. itself, so the steps come out unrolled, each at its cursor index
        await this.buildPlaybackSteps(this.cursor);
        await this.maybeYieldToUi();

        this.hydrateOsmdArray();
        await this.maybeYieldToUi();

        this.linkMidiTicksToCursorIndex();

        const score = this.verify();
        this.slopScoreSignal.set(score);
        this.feedbackSignal.set(null);

        this.osmdArray!.clear();
        this.midiTicksNoteMap.clear();
        // this.osmdMeasureSequence (one number per played measure) is kept: measureSequence exposes it
        // this.osmdCursorIdxToMeasureMap.clear(); is used for slider and must not be cleared
        // this.midiTicksToOsmdCursorIndex will be our main output and must not be cleared    
        return score;
    }


    setAlignmentAlgorithm(algorithm: CursorAlignmentAlgorithm): void {
        this.alignmentAlgorithm = algorithm;
    }

    getAlignmentAlgorithm(): CursorAlignmentAlgorithm {
        return this.alignmentAlgorithm;
    }

    private runSelectedAlignment(osmdArray: OsmdArrayElement[]): OsmdArrayElement[] {
        return this.alignmentAlgorithm === "sw2"
            ? smithWatermanAlign2(osmdArray)
            : smithWatermanAlign(osmdArray);
    }

    nextNote(note: Note) {
        const link = this.midiTicksToOsmdCursorIndex.get(note.ticks);
        if (link != null) {
            // The iterator first (the notes under the cursor follow it), then the style, then one update()
            // that draws both
            const moved = this.stepIterator(this.cursor!, link.osmdIndex);
            if (this.isCursorOk(note)) {
                this.cursor!.CursorOptions.color = CURSOR_GOOD_COLOR;
                this.cursor!.CursorOptions.type = 4;
            } else {
                this.cursor!.CursorOptions.type = 3; // measure rectangle
            }
            if (moved) {
                this.drawCursor(this.cursor!);
            }
            const newOsmdMeasure = link.osmdMeasure;
            if (newOsmdMeasure !== this.measure()) {
                this.measure.set(newOsmdMeasure);
            }
        } 
        //else {
            //console.warn("note not found", note.midi, "ticks:", note.ticks);
        //}
    }

    /**
     * Reset the running cursor to a given measure.
     * Usefull when seeking or at the end of the sheet.
     * 
     * @param start The measure index to reset the cursor to.
     * @returns void
     */
    reset(start: number = 0) {
        const cursor = this.cursor;
        if (!cursor) {
            this.cursorIndex = 0;
            this.measure.set(0);
            return;
        }
        const targetMeasure = Math.max(0, Math.trunc(start - 1));
        this.cursorIndex = 0;
        // The iterator back to the start and on to the target, then one drawing (cursor.reset() drew too)
        cursor.resetIterator();
        this.stepIterator(cursor, this.findCursorIndexForMeasure(targetMeasure));
        this.drawCursor(cursor);
    }
    /**
     * The played measures, in playback order, of the score set up last (e.g. [0, 1, 2, 1, 2, 3]): one entry
     * per measure pass, as OSMD's iterator plays them.
     */
    get measureSequence(): readonly number[] {
        return this.osmdMeasureSequence;
    }

    /**
     * Walks the score once in playback order with OSMD's own iterator, building the step array the MIDI is
     * mapped onto (osmdArray) and the played-measure sequence (osmdMeasureSequence).
     *
     * With EngravingRules.CursorIgnoreRepetitions = false, MusicPartManagerIterator.moveToNext() takes the
     * repeats itself: backward repeats (as often as `<repeat times>` says), the ending (volta) of each pass,
     * D.C. / D.S. al Fine / al Coda. The walk moves exactly like stepIterator() does (cursor.reset(), then
     * moveToNextVisibleVoiceEntry), so step k of the walk IS cursor index k: no jump targets to resolve.
     *
     * A measure pass starts where the measure changes, where OSMD reports a jump, or where the time within the
     * measure goes back (a measure repeated by itself, after a jump hidden by skipped invisible entries).
     */
    private async buildPlaybackSteps(cursor: Cursor): Promise<void> {
        const feedbackMessage = $localize`:@@workbench.progress.cursor:Initializing the sheet cursor`;
        // A runaway guard far above any score (Diabelli's 298 played measures take about 2,000 steps); the number
        // of steps is not known before the walk, so progress is reported at its start and end (it takes a few ms)
        const maxSteps = 1_000_000;
        const osmdArray: OsmdArrayElement[] = [];
        const measureSequence: number[] = [];
        let step = 0;
        let midiMeasure = -1;
        let previousMeasure = -1;
        let previousInMeasure = -1;
        let maxMeasure = -1;
        this.feedback(feedbackMessage, 0);
        cursor.reset();
        while (!cursor.iterator.EndReached) {
            if (step > maxSteps) {
                console.error("[cursor][mapping] runaway detected in the playback walk", { step, maxSteps });
                throw new Error("cursor mapping runaway detected in the playback walk");
            }
            const iterator = cursor.iterator;
            const measure = iterator.CurrentMeasure.measureListIndex;
            const inMeasure = iterator.CurrentRelativeInMeasureTimestamp.RealValue;
            const newPass = measure !== previousMeasure || iterator.JumpOccurred || inMeasure <= previousInMeasure;
            if (newPass) {
                midiMeasure++;
                measureSequence.push(measure);
                // the previous step that has notes closed the previous pass
                const last = osmdArray.at(-1);
                if (last) last.isLast = true;
            }
            previousMeasure = measure;
            previousInMeasure = inMeasure;
            maxMeasure = Math.max(maxMeasure, measure);

            const notesUnderCursor: OSMDNote[] = (iterator.CurrentVoiceEntries ?? []).flatMap(voiceEntry => voiceEntry.Notes ?? []);
            if (notesUnderCursor.length > 0) {
                osmdArray.push({
                    midiMeasure,
                    osmdMeasure: measure,
                    osmdIndex: step,
                    index: step,
                    isFirst: newPass,
                    isLast: false, // set when the next pass starts
                    isSkipable: notesUnderCursor.every(n => this.isSkipable(n)),
                    isJump: false, // OSMD takes the jumps: the cursor index never goes back
                    target: null,
                    targetMeasure: null,
                    osmdPitches: notesUnderCursor
                        .map(n => n.Pitch?.getHalfTone())
                        .filter((pitch): pitch is number => pitch != null)
                        .map(pitch => pitch + 12), // align octave with midi
                    midiPitches: [],
                    midiTicks: null,
                    midiTicksDuration: null,
                    midiTime: null,
                });
            }

            iterator.moveToNextVisibleVoiceEntry(false);
            step++;
            if ((step & 255) === 0) {
                await this.maybeYieldToUi();
            }
        }
        const last = osmdArray.at(-1);
        if (last) last.isLast = true;
        cursor.reset();
        this.cursorIndex = 0;

        this.osmdMeasureCount = maxMeasure + 1;
        this.maxMidiMeasure = Math.max(0, midiMeasure);
        this.osmdMeasureSequence = measureSequence;
        this.osmdArray = osmdArray;
        this.feedback(feedbackMessage, 100);
    }


    arrRemove(arr: number[], value: number): void {
        const pos = arr.indexOf(value);
        if (pos !== -1) {
            arr.splice(pos, 1);
        }
    }

    private hasAnyPitchOverlap(expectedPitches: number[] | null | undefined, eventPitches: number[]): boolean {
        if (!expectedPitches || expectedPitches.length === 0 || eventPitches.length === 0) {
            return false;
        }

        for (const eventPitch of eventPitches) {
            if (expectedPitches.includes(eventPitch)) {
                return true;
            }
        }

        return false;
    }

    private areAllExpectedPitchesAssigned(expectedPitches: number[] | null | undefined, assignedPitches: number[]): boolean {
        if (!expectedPitches || expectedPitches.length === 0) {
            return true;
        }

        for (const expectedPitch of expectedPitches) {
            if (!assignedPitches.includes(expectedPitch)) {
                return false;
            }
        }

        return true;
    }

    private collectUnassignedMatchingPitches(expectedPitches: number[] | null | undefined, assignedPitches: number[], eventPitches: number[]): number[] {
        if (!expectedPitches || expectedPitches.length === 0 || eventPitches.length === 0) {
            return [];
        }

        const pitchesToAdd: number[] = [];
        for (const eventPitch of eventPitches) {
            if (!expectedPitches.includes(eventPitch)) {
                continue;
            }
            if (assignedPitches.includes(eventPitch) || pitchesToAdd.includes(eventPitch)) {
                continue;
            }
            pitchesToAdd.push(eventPitch);
        }

        return pitchesToAdd;
    }



    hydrateOsmdArray(lookahead = 6): OsmdArrayElement[] {
        const osmdArray = this.osmdArray!;
        const sortedTicks = this.sortedMidiTicks;
        const midiTicksNoteMap = this.

            midiTicksNoteMap;

        /** Return the index of the first non-skippable step at or after `from`. */
        const nextPlayable = (from: number): number => {
            let i = from;
            while (i < osmdArray.length && osmdArray[i].isSkipable) i++;
            return i;
        };

        /**
         * Scan up to `lookahead` non-skippable steps ahead of `osmdIdx`.
         * Returns the index of the first step whose osmdPitches overlap with
         * `eventPitches`, or -1 if none is found within the window.
         */
        const findAheadMatch = (eventPitches: number[]): number => {
            let ahead = nextPlayable(osmdIdx + 1);
            for (let k = 0; k < lookahead && ahead < osmdArray.length; k++) {
                if (this.hasAnyPitchOverlap(osmdArray[ahead].osmdPitches, eventPitches)) {
                    return ahead;
                }
                ahead = nextPlayable(ahead + 1);
            }
            return -1;
        };

        let osmdIdx = nextPlayable(0);
        let midiIdx = 0;

        while (osmdIdx < osmdArray.length && midiIdx < sortedTicks.length) {
            const step = osmdArray[osmdIdx];
            const stepPitches = step.osmdPitches ?? [];
            const assignedPitches = step.midiPitches;
            const stepSatisfied = this.areAllExpectedPitchesAssigned(stepPitches, assignedPitches);

            const ticks = sortedTicks[midiIdx];
            const midiNotes = midiTicksNoteMap.get(ticks) ?? [];
            const eventPitches = midiNotes.map(n => n.midi);

            const pitchesToAdd = stepSatisfied
                ? []
                : this.collectUnassignedMatchingPitches(stepPitches, assignedPitches, eventPitches);
            const matchesCurrent = pitchesToAdd.length > 0;
            // Only pay the lookahead cost when the current step can't absorb the event
            const aheadMatchIdx = !matchesCurrent ? findAheadMatch(eventPitches) : -1;
            const matchesAhead = aheadMatchIdx !== -1;

            // ── Advance decision ──────────────────────────────────────────────
            if (stepSatisfied) {
                if (matchesAhead) {
                    // Step complete and a later step wants this event → advance, retry tick
                    osmdIdx = aheadMatchIdx;
                } else {
                    // Step complete but event is an embellishment → consume, stay
                    midiIdx++;
                }
                continue;
            }

            if (!matchesCurrent && matchesAhead) {
                // Voicing gap: event belongs to a later step → advance, retry tick
                osmdIdx = aheadMatchIdx;
                continue;
            }

            // ── Assignment ───────────────────────────────────────────────────
            // Collect only the score-expected pitches present in this event
            if (pitchesToAdd.length > 0) {
                if (step.midiTicks === null) {
                    step.midiTicks = ticks;
                    step.midiTime = midiNotes[0]?.time ?? null;
                }
                step.midiPitches.push(...pitchesToAdd);
            }
            // If pitchesToAdd is empty (pure embellishment / no match), the tick is
            // consumed without touching midiTicks so the step isn't polluted.


            midiIdx++;
        }

        return osmdArray;
    }

    /***     */
    //    async hydrateOsmdArray(cursor: Cursor): Promise<OsmdArrayElement[]> {
    //     }
    /**      */










    /*
    * Build a map of midi step (ticks) => MidiNote[]
    * @param midi the midi file to process
    * @return this.midiTicksNoteMap
    */
    buildMidiTicksNoteMap(midi: Midi): Map<number, MidiNote[]> {
        const totalNotes = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0);
        const feedbackMessage = $localize`:@@workbench.progress.midiMap:Building the MIDI map`;
        const feedbackStep = Math.max(1, Math.floor(totalNotes / 100));
        this.feedback(feedbackMessage, 0);

        const midiTicksNoteMap = new Map<number, MidiNote[]>();
        let processedNotes = 0;
        for (const track of midi.tracks) {
            for (const note of track.notes) {
                const bucket = midiTicksNoteMap.get(note.ticks);
                if (bucket) {
                    bucket.push(note);
                } else {
                    midiTicksNoteMap.set(note.ticks, [note]);
                }
            }
        }
        this.midiTicksNoteMap = midiTicksNoteMap;
        this.sortedMidiTicks = Array.from(this.midiTicksNoteMap.keys()).sort((a, b) => a - b);
        this.feedback(feedbackMessage, 100);
        return this.midiTicksNoteMap;
    }


    /**
     *  this function first fill osmdArray with midiTicks and notes then output mapMidiTicksToOsmdCursorIndex
     *  
     *  @return this.mapMidiTicksToOsmdCursorIndex will trigger (or not) the cursor advance and back in another service
     */
    linkMidiTicksToCursorIndex(): Map<number, { osmdIndex: number, osmdMeasure: number }> {
        this.osmdArray!.forEach(element => {
            this.midiTicksToOsmdCursorIndex.set(element.midiTicks ?? -1, { osmdIndex: element.osmdIndex, osmdMeasure: element.osmdMeasure });
            if (!this.osmdCursorIdxToMeasureMap.has(element.osmdMeasure)) {
                this.osmdCursorIdxToMeasureMap.set(element.osmdMeasure, element.osmdIndex);            
            }
        });
        return this.midiTicksToOsmdCursorIndex;
    }

    /**
     * The share of mapped cursor steps (in %, one decimal) whose MIDI pitches the score does not expect there.
     */
    verify(): number {
        const osmdArray = this.osmdArray ?? [];
        const notOkCount = osmdArray.filter(element => !this.isOsmdArrayElementOk(element)).length;
        this.cursor!.CursorOptions.color = CURSOR_GOOD_COLOR;
        return osmdArray.length === 0 ? 0 : Math.round((notOkCount / osmdArray.length) * 1000) / 10;
    }


    /*=========================================================================
     *                         cursor manipulation
     *=========================================================================
     */

    /**
     * Move the cursor to a specific osmd index, 
     * this will be used to link midi ticks to osmd cursor position
     * @param cursor The cursor to move.
     * @param targetIndex The target osmd index to move the cursor to.
     */
    moveCursorToOsmdIndex(cursor: Cursor, targetIndex: number): void {
        if (this.stepIterator(cursor, targetIndex)) {
            this.drawCursor(cursor);
        }
    }

    /**
     * Draws the cursor where its iterator is, and keeps it in view. OSMD's own follow (osmd.FollowCursor) ran a
     * smooth scrollIntoView on every step; this scrolls only when the cursor leaves the view.
     */
    private drawCursor(cursor: Cursor): void {
        cursor.update();
        if (this.follow) {
            this.keepInView(cursor.cursorElement);
        }
    }

    private keepInView(element: HTMLElement | undefined): void {
        if (!element?.isConnected) return;
        if (this.scrollerOf?.element !== element) {
            this.scrollerOf = { element, x: scrollingAncestor(element, 'x'), y: scrollingAncestor(element, 'y') };
        }
        const [top, bottom] = visibleRange(this.scrollerOf.y, 'y');
        const [left, right] = visibleRange(this.scrollerOf.x, 'x');
        const cursor = element.getBoundingClientRect();
        const marginY = (bottom - top) * CURSOR_FOLLOW_MARGIN;
        const marginX = (right - left) * CURSOR_FOLLOW_MARGIN;
        if (cursor.top < top + marginY || cursor.bottom > bottom - marginY
            || cursor.left < left + marginX || cursor.right > right - marginX) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }

    /**
     * Steps the cursor's iterator to `targetIndex` without drawing it; true when it moved. cursor.next() /
     * previous() each run update() (a forced layout and a smooth scrollIntoView), which an onset spanning several
     * steps, or a seek, paid on every step: the caller draws once.
     *
     * The index counts steps in playback order (OSMD's iterator takes the repeats going forward). Going back,
     * OSMD moves in source order: it neither undoes the jumps it took nor rewinds the pass counts of the
     * repeats, so a step back across a repeat would leave the index and the iterator out of step. A move back
     * replays from the start instead (iterator steps only, nothing is drawn).
     */
    private stepIterator(cursor: Cursor, targetIndex: number): boolean {
        const from = this.cursorIndex;
        if (targetIndex < this.cursorIndex) {
            cursor.resetIterator();
            this.cursorIndex = 0;
        }
        if (targetIndex > this.cursorIndex) {
            while (this.cursorIndex < targetIndex && !cursor.iterator.EndReached) {
                cursor.iterator.moveToNextVisibleVoiceEntry(false);
                this.cursorIndex++;
            }
        }
        return this.cursorIndex !== from;
    }


    /*=========================================================================
     *                         utility functions
     *=========================================================================
     */


    /**
     * Return true if the note has no  correspondinf midi event
     * If is a rest, a cue note, or tied but not the first of the tie
     * @param n
     * @returns 
     */
    private isSkipable(n: OSMDNote): boolean {
        const r = n.isRest()
            || (n.NoteTie
                //&& n.NoteTie.TieDirection==0
                && n.NoteTie?.Notes.at(0)?.NoteToGraphicalNoteObjectId
                !== n.NoteToGraphicalNoteObjectId
            )
            || n.IsCueNote
            || n.IsGraceNote;
        return r;
    }

    private isCursorOk(note: Note): boolean {
        return this.cursor!.NotesUnderCursor().map(n => n.Pitch?.getHalfTone() % 12).some(n => n === note.midi % 12);
    }


    /** Gives the UI a turn (setTimeout 0, a few ms) only when setup has worked UI_YIELD_AFTER_MS without one. */
    private async maybeYieldToUi(): Promise<void> {
        if (performance.now() - this.lastYield < CursorService.UI_YIELD_AFTER_MS) return;
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        this.lastYield = performance.now();
    }

    feedback(message: string, percentage: number) {
        percentage = Math.round(percentage);
        if (percentage % 1 === 0) {
            this.feedbackSignal.set({ message, percentage });
        }
    }

    private normalizePitchClass(pitch: number): number {
        return pitch % 12;
    }

    private isOsmdArrayElementOk(element: OsmdArrayElement): boolean {
        const osmdPitchClasses = new Set(element.osmdPitches ?? []);
        const midiPitchClasses = new Set(element.midiPitches ?? []);
        const midiIsSubsetOfOsmd = Array.from(midiPitchClasses)
            //.map(pitch => pitch % 12)
            .every(pitch => osmdPitchClasses.has(pitch));
        return element.isSkipable || midiIsSubsetOfOsmd;
    }



    private findCursorIndexForMeasure(targetMeasure: number): number {
        return this.osmdCursorIdxToMeasureMap.get(targetMeasure) ?? 0;
    }

    ngOnDestroy(): void {
        this.resetSession();
    }

}