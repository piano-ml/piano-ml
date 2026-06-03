
import { Injectable, signal, OnDestroy } from "@angular/core";
import { Midi } from "@tonejs/midi";
import type { Note as MidiNote, Note } from "@tonejs/midi/dist/Note";
import { AlignmentType, Cursor, RepetitionInstruction, RepetitionInstructionEnum, Note as OSMDNote, GraphicalNote, VexFlowGraphicalNote, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { CURSOR_BAD_COLOR, CURSOR_GOOD_COLOR } from "../components/osmd/osmd.config";
import { smithWatermanAlign, smithWatermanAlign2 } from "./smith-waterman";
import { CursorAlignmentAlgorithm, OsmdArrayElement } from "../model/model";



@Injectable({
    providedIn: 'root'
})
export class CursorService implements OnDestroy {

    private static readonly DIAGNOSTIC_STORAGE_KEY = "cursorService.debug";
    private static readonly DIAGNOSTIC_SAMPLE_LIMIT = 12;
    private static readonly UI_YIELD_STEP = 8;
    private setupTimeoutId?: ReturnType<typeof setTimeout>;
    private diagnosticMode = this.readDiagnosticModeFromStorage();
    private alignmentAlgorithm: CursorAlignmentAlgorithm = "sw2";
    private cursorIndex = 0;
    private iteratorSize = 0;
    private repetitionInstructions: RepetitionInstruction[] = [];
    private osmdArray: OsmdArrayElement[] | undefined;
    private midiTicksNoteMap: Map<number, MidiNote[]> = new Map();   // ticks => MidiNote[]    
    //private audioTimeNoteMapHit: Map<number, { pitch: number, hit: boolean }[]> = new Map();   // audioTime => [{pitch, hit}]
    private osmdCursorIdxNoteMap: Map<number, OSMDNote[]> = new Map();
    private osmdCursorIdxToMeasureMap: Map<number, number> = new Map();
    private osmdMeasureNoteMap: Map<number, OSMDNote[]> = new Map();
    private osmdMeasureSequence: number[] = [];
    private midiBarToOsmdMeasure: Map<number, number> = new Map();
    private verifyAllElementsOk = false;
    private verifyAllElementsOkSignal = signal<boolean>(false);
    public maxMidiMeasure = 0;
    // Signal exposé pour le slop score
    public slopScoreSignal = signal<number>(0);


    cursor: Cursor | undefined;
    osmdMeasureCount = 0;
    feedbackSignal = signal<{ message: string; percentage: number } | null>(null);
    readonly measure = signal<number>(0);
    audioTimeNoteArray: Array<[number, { pitch: number, hit: boolean }[]]> = [];
    midiTicksToOsmdCursorIndex: Map<number, { osmdIndex: number, osmdMeasure: number }> = new Map();
    osmdMeasureToFirstStepIndex: Map<number, number> = new Map();
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
        this.iteratorSize = 0;
        this.maxMidiMeasure = 0;
        this.osmdMeasureCount = 0;
        this.verifyAllElementsOk = false;
        this.verifyAllElementsOkSignal.set(false);

        this.midiTicksNoteMap.clear();
        this.osmdCursorIdxNoteMap.clear();
        this.osmdCursorIdxToMeasureMap.clear();
        this.osmdMeasureNoteMap.clear();
        this.midiBarToOsmdMeasure.clear();
        this.midiTicksToOsmdCursorIndex.clear();
        this.osmdMeasureToFirstStepIndex.clear();
        this.repetitionInstructions = [];
        this.osmdMeasureSequence = [];
        this.sortedMappedMidiTicks = [];
        this.sortedMidiTicks = [];
        this.audioTimeNoteArray = [];

        if (this.osmdArray) {
            this.osmdArray.clear();
            this.osmdArray = undefined;
        }

        this.cursor = undefined;
        this.debugLog("cursor session reset");
    }

    public async setup(cursor: Cursor, midi: Midi): Promise<number> {

        this.cursor = cursor;
        this.midiTicksToOsmdCursorIndex.clear();
        this.feedbackSignal.set({ message: 'Initializing...', percentage: 0 });
        await this.yieldToUi();

        this.buildMidiTicksNoteMap(midi)
        midi = null as any; // free memory
        await this.yieldToUi();

        this.hydrateRepetitionInstructions(this.cursor);
        await this.yieldToUi();

        this.builOsmdMeasureNoteMap(this.cursor);
        await this.yieldToUi();

        this.buildOsmdMeasureSequence();
        await this.yieldToUi();

        this.initOsmdArray();
        await this.yieldToUi();


        this.osmdMeasureToFirstStepIndex.clear();
        await this.buildOsmdStepsSequence(cursor);
        await this.yieldToUi();

        this.hydrateTargets(this.osmdMeasureToFirstStepIndex);
        await this.yieldToUi();


        this.hydrateOsmdArray();
        await this.yieldToUi();

        this.debugStep("Final hydration", this.osmdArray!);

        this.linkMidiTicksToCursorIndex();
        await this.yieldToUi();

        if (this.diagnosticMode) {
            console.groupCollapsed("[cursor][mapping] mapMidiTicksToOsmdCursorIndex");
            console.table(
                Array.from(this.midiTicksToOsmdCursorIndex.entries()).map(([midiTicks, v]) => ({ midiTicks, osmdIndex: v.osmdIndex, osmdMeasure: v.osmdMeasure })));
            console.groupEnd();
        }



        let score = this.verify(true);
        this.slopScoreSignal.set(score);
        this.feedbackSignal.set(null);
        await this.yieldToUi();

        this.osmdArray!.clear();
        this.midiTicksNoteMap.clear();
        this.osmdCursorIdxNoteMap.clear();
        this.osmdMeasureNoteMap.clear();
        this.osmdMeasureNoteMap.clear();
        this.osmdMeasureSequence = [];
        this.midiBarToOsmdMeasure.clear();
        // this.osmdCursorIdxToMeasureMap.clear(); is used for slider and must not be cleared
        // this.midiTicksToOsmdCursorIndex will be our main output and must not be cleared    
        return score;
    }


    setAlignmentAlgorithm(algorithm: CursorAlignmentAlgorithm): void {
        this.alignmentAlgorithm = algorithm;
        this.debugLog("alignment algorithm updated", { algorithm: this.alignmentAlgorithm });
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
            this.moveCursorToOsmdIndex(this.cursor!, link.osmdIndex);
            if (this.isCursorOk(note)) {
                this.cursor!.CursorOptions.color = CURSOR_GOOD_COLOR;
                this.cursor!.CursorOptions.type = 4;
            } else {
                //if (this.diagnosticMode) {
                //    this.cursor!.CursorOptions.color = CURSOR_BAD_COLOR;
                //}
                this.cursor!.CursorOptions.type = 3; // measure rectangle
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
        cursor.reset();
        const targetCursorIndex = this.findCursorIndexForMeasure(targetMeasure);


        this.moveCursorToOsmdIndex(cursor, targetCursorIndex);
    }
    /**
     * First pass
     * 
     * @param cursor 
     * @returns 
     */
    private async buildOsmdStepsSequence(cursor: Cursor): Promise<Map<number, number>> {
        let feedbackMessage = "Building Step Sequence";
        const feedbackStep = Math.max(1, Math.floor(this.iteratorSize / 100));
        cursor.reset();
        const osmdSteps: number[] = [];
        const osmdMeasureToFirstStepIndex = this.osmdMeasureToFirstStepIndex;
        let feedbackCounter = 0;
        while (!cursor.iterator.EndReached) {
            const currentMeasureListIndex = cursor.iterator.CurrentMeasure.measureListIndex;
            if (!osmdMeasureToFirstStepIndex.has(currentMeasureListIndex)) {
                osmdMeasureToFirstStepIndex.set(currentMeasureListIndex, osmdSteps.length);
            }
            osmdSteps.push(currentMeasureListIndex);
            cursor.iterator.moveToNext();
            feedbackCounter++;
            if (feedbackCounter % feedbackStep === 0) {
                this.feedback(feedbackMessage, (feedbackCounter / this.iteratorSize) * 100);
            }
            if (feedbackCounter % CursorService.UI_YIELD_STEP === 0) {
                await this.yieldToUi();
            }
        }
        this.feedback(feedbackMessage, 99);
        cursor.reset();
        if (this.diagnosticMode) {
            console.groupCollapsed(feedbackMessage);
            console.table(Array.from(osmdMeasureToFirstStepIndex.entries()).map(([measure, step]) => ({ measure, step })));
            console.groupEnd();
        }
        this.feedback(feedbackMessage, 100);
        await this.yieldToUi();
        return this.osmdMeasureToFirstStepIndex;

    }

    initOsmdArray(): void {
        let index = 0;
        const osmdArray: OsmdArrayElement[] = [];
        let midiMeasureIndex = 0;
        const osmdMesureSequence = this.osmdMeasureSequence;
        const maxSecondPassIterations = Math.max(this.iteratorSize * 20, osmdMesureSequence.length * 20, 20000);
        const cursor = this.cursor!;
        const feedbackMessage = "Initializing Sheet Cursor";
        let secondPassCounter = 0;
        while (!cursor.iterator.EndReached) {
            if (secondPassCounter > maxSecondPassIterations) {
                const diagnosticState = {
                    secondPassCounter,
                    maxSecondPassIterations,
                    midiMeasureIndex,
                    osmdMeasureSequenceLength: osmdMesureSequence.length,
                    currentMeasureListIndex: cursor.iterator.CurrentMeasure.measureListIndex,
                    osmdArrayLength: osmdArray.length,
                };
                console.error("[cursor][mapping] runaway detected in pass (2/4)", diagnosticState);
                throw new Error("cursor mapping runaway detected in pass (2/4)");
            }

            const firstIter = this.isFirstIterOfMeasure(index, cursor)
            const lastIter = this.isLastIterOfMeasure(index, cursor)
            const osmdMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
            const currentMeasureValue = osmdMesureSequence[midiMeasureIndex];
            const nextMeasureValue = osmdMesureSequence[midiMeasureIndex + 1];
            const hasMeasureTransition = currentMeasureValue != null && nextMeasureValue != null;
            const isNaturalAdvance = hasMeasureTransition && nextMeasureValue === currentMeasureValue + 1;
            const isJump =
                lastIter
                && hasMeasureTransition
                && !isNaturalAdvance;
            const jumpTargetMeasure = isJump ? nextMeasureValue : null;
            let notesUnderCursor: OSMDNote[] = (cursor.iterator.CurrentVoiceEntries ?? [])
                .flatMap(voiceEntry => voiceEntry.Notes ?? []);
            const isTremolo = notesUnderCursor.at(0)?.TremoloInfo != null;

            if (notesUnderCursor.length === 0) {
                cursor.iterator.moveToNext();
                index++;
                secondPassCounter++;
                if (lastIter) {
                    midiMeasureIndex++;
                    this.feedback(feedbackMessage, (midiMeasureIndex / osmdMesureSequence.length) * 100);
                }
                continue;
            }
            notesUnderCursor = (cursor.iterator.CurrentVoiceEntries ?? [])
                .flatMap(voiceEntry => voiceEntry.Notes ?? []);

            const osmdPitches = notesUnderCursor
                .map(n => n.Pitch?.getHalfTone())
                .filter((pitch): pitch is number => pitch != null)
                .map(pitch => pitch + 12); // align octave with midi
            const toSkip = notesUnderCursor.every(n => this.isSkipable(n));
            const o: OsmdArrayElement = {
                midiMeasure: midiMeasureIndex,
                osmdMeasure: osmdMeasureIndex,
                osmdIndex: 0,
                index: index,
                isFirst: firstIter,
                isLast: lastIter,
                isSkipable: toSkip,
                isJump: isJump,
                target: null, // will be filled in next pass
                targetMeasure: jumpTargetMeasure,
                osmdPitches,
                midiPitches: [],
                midiTicks: null,
                midiTicksDuration: null,
                midiTime: null
            }
            osmdArray.push(o);
            if (o.isLast && hasMeasureTransition && !isNaturalAdvance) {
                const targetMeasure = osmdMesureSequence[midiMeasureIndex + 1];
                this.moveToMeasure(targetMeasure);
                //await this.yieldToUi(); // yield to let the cursor update
            } else {
                cursor.iterator.moveToNext();
            }
            index++;
            secondPassCounter++;
            if (lastIter) {
                midiMeasureIndex++;
                this.feedback(feedbackMessage, (midiMeasureIndex / osmdMesureSequence.length) * 100);
            }
            if (secondPassCounter % CursorService.UI_YIELD_STEP === 0) {
                //await this.yieldToUi();
            }
        }
        this.maxMidiMeasure = Math.max(...osmdArray.map(e => e.midiMeasure))
        cursor.reset();
        this.feedback(feedbackMessage, 100);
        this.debugStep(feedbackMessage, osmdArray);
        this.osmdArray = osmdArray;
    }

    debugStep(feedbackMessage: string, osmdArray: OsmdArrayElement[]): void {
        if (!this.diagnosticMode) {
            return;
        }
        console.groupCollapsed("[cursor][mapping][hydrateOsmdArray]" + feedbackMessage);
        console.table(Array.from(osmdArray));
        console.groupEnd();

    }

    hydrateTargets(osmdMeasureToFirstStepIndex: Map<number, number>): OsmdArrayElement[] {
        //console.log("hydrateTargets start (need osmdMeasureToFirstStepIndex)", osmdMeasureToFirstStepIndex);
        const osmdArray = this.osmdArray!;
        const feedbackMessage = "Hydrating Cursor";
        let targetOsmdIndex = 0;
        let thirdPassCounter = 0;
        const feedbackStep = Math.max(1, Math.floor(osmdArray.length / 100));
        const uiYieldStep = CursorService.UI_YIELD_STEP;
        for (let i = 0; i < osmdArray.length; i++) {
            const o = osmdArray[i];
            o.osmdIndex = targetOsmdIndex;
            if (o.isJump) {
                const resolvedTarget = osmdMeasureToFirstStepIndex.get(o.targetMeasure!);
                targetOsmdIndex = resolvedTarget!;
                o.target = targetOsmdIndex;
            } else {
                targetOsmdIndex++;
            }

            thirdPassCounter++;
            if (thirdPassCounter % feedbackStep === 0 || thirdPassCounter === osmdArray.length) {
                this.feedback(feedbackMessage, (thirdPassCounter / osmdArray.length) * 100);
            }
            if (thirdPassCounter % uiYieldStep === 0) {
                //await this.yieldToUi();
            }
        }
        this.debugStep(feedbackMessage, osmdArray); //.filter(o => o.osmdMeasure==8));
        this.feedback(feedbackMessage, 100);

        return osmdArray;
    }


    inDebugRange(idx: number): boolean {
        return idx > 514 && idx < 545;
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

            if (this.inDebugRange(osmdIdx)) {
                console.log('[hydrateOsmdArray]', ticks, osmdIdx, step.osmdPitches, step.midiPitches);
            }

            midiIdx++;
        }

        this.debugStep("Hydrating MIDI pitches", osmdArray);
        return osmdArray;
    }

    /***     */
    //    async hydrateOsmdArray(cursor: Cursor): Promise<OsmdArrayElement[]> {
    //     }
    /**      */





    /**
     * Build a repetition-aware sequence of OSMD measure indices (e.g. [1,2,3,1,2,3,4,...]).
     * This is intentionally computed standalone for future refactors.
     */
    buildOsmdMeasureSequence(): number[] {
        const feedbackMessage = "Building Measure Sequence";
        this.feedback(feedbackMessage, 0);
        const osmdMeasureSequence: number[] = Array.from(this.osmdMeasureNoteMap.keys());
        const outputSequence: number[] = [];
        let passCount = 1;
        let currentMeasureNumber = 0;
        let anchor = 0;
        let insideVolta = false;
        let security = 0;

        let daCapoCount = 0;
        const MAX_DACAPO = 2; // security
        while (currentMeasureNumber < osmdMeasureSequence.length && security < 10000) {
            security++;
            const isStartBar = this.repetitionInstructions.find(
                instr =>
                    instr.type === RepetitionInstructionEnum.StartLine
                    && instr.alignment === AlignmentType.End
                    && instr.measureIndex === currentMeasureNumber
            );
            if (isStartBar && anchor !== currentMeasureNumber) {
                anchor = currentMeasureNumber;
                passCount = 1;
            }

            // DaCapo handling
            const isDaCapo = this.repetitionInstructions.find(
                instr =>
                    instr.type === RepetitionInstructionEnum.DaCapo
                    && instr.alignment === AlignmentType.End
                    && instr.measureIndex === currentMeasureNumber
            );
            if (isDaCapo) {
                daCapoCount++;
                if (daCapoCount > MAX_DACAPO) {
                    break; // security
                }
                currentMeasureNumber = 0;
                passCount = 1;
                continue;
            }

            const currentVoltaStart = this.repetitionInstructions.find(
                instr =>
                    instr.type === RepetitionInstructionEnum.Ending
                    && instr.alignment === AlignmentType.Begin
                    && !instr.endingIndices.includes(passCount)
                    && currentMeasureNumber === instr.measureIndex
            );
            if (currentVoltaStart) {
                insideVolta = true;
            }
            if (!insideVolta) {
                outputSequence.push(currentMeasureNumber);
            }
            const currentVoltaEnd = this.repetitionInstructions.find(
                instr =>
                    instr.type === RepetitionInstructionEnum.Ending
                    && instr.alignment === AlignmentType.End
                    && !instr.endingIndices.includes(passCount)
                    && currentMeasureNumber === instr.measureIndex
            );
            if (currentVoltaEnd) {
                insideVolta = false;
            }

            const isBackJump = this.repetitionInstructions.find(
                instr =>
                    instr.type === RepetitionInstructionEnum.BackJumpLine
                    && instr.alignment === AlignmentType.End
                    && instr.measureIndex === currentMeasureNumber
            )

            if (isBackJump && passCount == 1) {
                currentMeasureNumber = anchor;
                passCount++;
            } else {
                currentMeasureNumber++;
            }
        }
        this.feedback(feedbackMessage, 100);
        this.osmdMeasureSequence = outputSequence;
        return outputSequence;
    }


    /**
     * construst the list of repetition instructions reading info from osmd sheet via the cursor
     * @param cursor 
     * @return repetitionInstructions the list of repetition instructions
     */
    hydrateRepetitionInstructions(cursor: Cursor): RepetitionInstruction[] {
        const feedbackMessage = "Building Voltas List";
        this.feedback(feedbackMessage, 0)
        this.repetitionInstructions = [];
        this.iteratorSize = 0;
        const feedbackStep = 1;
        while (!cursor.iterator.EndReached) {
            this.iteratorSize++;
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
            if (this.iteratorSize % feedbackStep === 0) {
                this.feedback(feedbackMessage, Math.min(90, this.iteratorSize));
            }
        }
        this.feedback(feedbackMessage, 95)

        // deduplicate this.repetitionInstructions
        this.repetitionInstructions = Array.from(
            new Map(this.repetitionInstructions.map(instr => [instr, instr])).values()
        );
        this.feedback(feedbackMessage, Math.min(100, this.iteratorSize));
        return this.repetitionInstructions;
    }

    /**
     * build a map of measure index => osmd notes under cursor using the cursor to extract this information
     * @param cursor  
     * @return this.osmdMeasureNoteMap Map<number, OSMDNote[]> measure index => osmd notes under cursor
     */
    builOsmdMeasureNoteMap(cursor: Cursor): Map<number, OSMDNote[]> {
        const feedbackMessage = "Building Measures";
        this.feedback(feedbackMessage, 0);
        this.osmdMeasureNoteMap.clear();
        let maxMeasureNumberXml = 0;
        const totalSteps = Math.max(1, this.iteratorSize);
        const feedbackStep = Math.max(1, Math.floor(totalSteps / 100));
        let step = 0;
        cursor.reset();
        while (!cursor.iterator.EndReached) {
            const currentMeasure = cursor.iterator.CurrentMeasure;
            const currentIndex = currentMeasure.measureListIndex;
            maxMeasureNumberXml = Math.max(maxMeasureNumberXml, currentIndex);
            const notesUnderCursor = cursor.NotesUnderCursor();
            const bucket = this.osmdMeasureNoteMap.get(currentIndex);
            if (bucket) {
                bucket.push(...notesUnderCursor);
            } else {
                this.osmdMeasureNoteMap.set(currentIndex, notesUnderCursor);
            }
            cursor.iterator.moveToNext();
            step++;
            if (step % feedbackStep === 0 || step === totalSteps) {
                this.feedback(feedbackMessage, (step / totalSteps) * 100);
            }
        }
        this.osmdMeasureCount = maxMeasureNumberXml;
        this.feedback(feedbackMessage, 100);
        cursor.reset();
        return this.osmdMeasureNoteMap;
    }

    /**
     * Build a map of audio time (seconds) => MidiNote[] using the osmdArray  midiTime information 
     * 
     * @param osmdArray
     */
    // buildAudioTimeNoteMap(osmdArray: OsmdArrayElement[]) {
    //     this.audioTimeNoteMapHit.clear();
    //     for (const element of osmdArray) {
    //         if (element.midiTime != null && element.midiPitches != null) {
    //             const bucket = this.audioTimeNoteMapHit.get(element.midiTime) ?? [];
    //             for (const pitch of element.midiPitches) {
    //                 bucket.push({ pitch, hit: false });
    //             }
    //             this.audioTimeNoteMapHit.set(element.midiTime, bucket);
    //         }
    //     }
    //     // Génère le tableau trié pour accès rapide par intervalle
    //     this.audioTimeNoteArray = Array.from(this.audioTimeNoteMapHit.entries()).sort((a, b) => a[0] - b[0]);
    //     console.log("audioTimeNoteMapHit done");
    //     return this.audioTimeNoteMapHit;
    // }


    /*
    * Build a map of midi step (ticks) => MidiNote[]
    * @param midi the midi file to process
    * @return this.midiTicksNoteMap
    */
    buildMidiTicksNoteMap(midi: Midi): Map<number, MidiNote[]> {
        const totalNotes = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0);
        const feedbackMessage = "Building MIDI Map";
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
     * Verify the mapping by checking if midi ticks and osmd measures are correctly aligned 
     * according to some heuristics.
     */
    verify(getScore = false): number {
        this.yieldToUi();
        let notOkPercentage = 0;
        const osmdArray = this.osmdArray ?? [];
        let firstNotOkIndex: number | null = null;
        let notOkCount = 0;
        const totalCount = osmdArray.length;
        const invalidSamples: Array<{
            index: number;
            osmdIndex: number;
            osmdMeasure: number;
            midiMeasure: number;
            midiTicks: number | null;
            osmdPitches: string;
            midiPitches: string;
        }> = [];

        osmdArray.forEach((element, index) => {
            if (!this.isOsmdArrayElementOk(element)) {
                if (firstNotOkIndex == null) {
                    firstNotOkIndex = index;
                }
                notOkCount++;
                if (this.diagnosticMode && invalidSamples.length < CursorService.DIAGNOSTIC_SAMPLE_LIMIT) {
                    invalidSamples.push({
                        index,
                        osmdIndex: element.osmdIndex,
                        osmdMeasure: element.osmdMeasure,
                        midiMeasure: element.midiMeasure,
                        midiTicks: element.midiTicks,
                        osmdPitches: (element.osmdPitches ?? []).join(","),
                        midiPitches: (element.midiPitches ?? []).join(","),
                    });
                }
            }
        });

        this.verifyAllElementsOk = notOkCount === 0;
        this.verifyAllElementsOkSignal.set(this.verifyAllElementsOk);
        notOkPercentage = Math.round((notOkCount / totalCount) * 1000) / 10;
        if (this.diagnosticMode) {
            const repetitionTypeLabels: Record<number, string> = {
                [RepetitionInstructionEnum.StartLine]: "StartLine",
                [RepetitionInstructionEnum.ForwardJump]: "ForwardJump",
                [RepetitionInstructionEnum.BackJumpLine]: "BackJumpLine",
                [RepetitionInstructionEnum.Ending]: "Ending",
                [RepetitionInstructionEnum.DaCapo]: "DaCapo",
                [RepetitionInstructionEnum.DalSegno]: "DalSegno",
                [RepetitionInstructionEnum.Fine]: "Fine",
                [RepetitionInstructionEnum.ToCoda]: "ToCoda",
                [RepetitionInstructionEnum.DalSegnoAlFine]: "DalSegnoAlFine",
                [RepetitionInstructionEnum.DaCapoAlFine]: "DaCapoAlFine",
                [RepetitionInstructionEnum.DalSegnoAlCoda]: "DalSegnoAlCoda",
                [RepetitionInstructionEnum.DaCapoAlCoda]: "DaCapoAlCoda",
                [RepetitionInstructionEnum.Coda]: "Coda",
                [RepetitionInstructionEnum.Segno]: "Segno",
                [RepetitionInstructionEnum.None]: "None",
            };
            const repetitionSample = this.repetitionInstructions
                .slice(0, CursorService.DIAGNOSTIC_SAMPLE_LIMIT)
                .map((instr) => ({
                    measureIndex: instr.measureIndex,
                    alignment: instr.alignment,
                    typeText: repetitionTypeLabels[instr.type] ?? String(instr.type),
                    endingIndices: instr.endingIndices ? instr.endingIndices.join(",") : "",
                }));
            console.groupCollapsed("[verify] summary");
            console.log("repetitionInstructions", {
                count: this.repetitionInstructions.length,
                sample: repetitionSample,
            });
            console.log("osmdMeasureSequence", {
                count: this.osmdMeasureSequence.length,
                head: this.osmdMeasureSequence.slice(0, CursorService.DIAGNOSTIC_SAMPLE_LIMIT),
                tail: this.osmdMeasureSequence.slice(-CursorService.DIAGNOSTIC_SAMPLE_LIMIT),
            });
            console.log("osmdArray", {
                count: osmdArray.length,
                invalidSampleCount: invalidSamples.length,
                invalidSamples,
            });
            console.groupEnd();
        }
        if (!this.verifyAllElementsOk && this.diagnosticMode) {
            console.groupCollapsed("[cursor][verify] KO summary");
            console.log({
                firstNotOkIndex,
                notOkCount,
                notOkPercentage,
            });
            console.groupEnd();
            this.cursor!.CursorOptions.color = CURSOR_BAD_COLOR;
        } else {
            this.cursor!.CursorOptions.color = CURSOR_GOOD_COLOR;
        }
        this.yieldToUi();
        return notOkPercentage;
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
        if (targetIndex < this.cursorIndex) {
            while (this.cursorIndex > targetIndex && !cursor.iterator.FrontReached) {
                cursor.previous();
                this.cursorIndex--;
            }
        } else if (targetIndex > this.cursorIndex) {
            while (this.cursorIndex < targetIndex && !cursor.iterator.EndReached) {
                cursor.next();
                this.cursorIndex++;
            }
        }
    }

    /**
     * Move cursor to a given measure
     * @param targetMeasure 
     * 
     */
    moveToMeasure(targetMeasure: number) {
        if (this.cursor!.iterator.CurrentMeasure.measureListIndex > targetMeasure) {
            this.backToMeasure(targetMeasure);
            //if (targetMeasure === 0 && this.cursor!.iterator.CurrentMeasure.measureListIndex > targetMeasure) {
            this.backToMeasure(targetMeasure - 1);

        }
        if (this.cursor!.iterator.CurrentMeasure.measureListIndex < targetMeasure) {
            this.nextToMeasure(targetMeasure);
        }
    }


    /**
     * Move the cursor back to a specific measure
     */
    private backToMeasure(measureIndex: number): void {
        const cursor = this.cursor!;
        if (measureIndex == 0) {
            while (!cursor.iterator.FrontReached) {
                cursor.iterator.moveToPrevious() // .previousMeasure();
            }
        } else {
            while (cursor.iterator.CurrentMeasure.measureListIndex > measureIndex && !cursor.iterator.FrontReached) {
                cursor.iterator.moveToPrevious() // .previousMeasure();
            }
        }
    }

    /**
     * Move the cursor forward to a specific measure
     */
    private nextToMeasure(measureIndex: number): void {
        const cursor = this.cursor!;
        while (cursor.iterator.CurrentMeasure.measureListIndex < measureIndex && !cursor.iterator.EndReached) {
            cursor.iterator.moveToNext() // .nextMeasure();
        }
        //cursor.iterator.moveToPrevious(); // to be on the first element of the measure, not the first element of the next one   
    }


    /*=========================================================================
     *                         utility functions
     *=========================================================================
     */

    isFirstIterOfMeasure(index: number, cursor: Cursor) {
        if (index === 0 || cursor.iterator.FrontReached) {
            return true;
        }

        const currentMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
        cursor.iterator.moveToPrevious();
        const previousMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
        cursor.iterator.moveToNext();
        return previousMeasureIndex !== currentMeasureIndex;
    }

    isLastIterOfMeasure(index: number, cursor: Cursor) {
        const currentMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
        cursor.iterator.moveToNext();
        if (this.cursor!.iterator.EndReached) {
            cursor.iterator.moveToPrevious();
            return true;
        }
        const nextMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
        cursor.iterator.moveToPrevious();
        return (nextMeasureIndex !== currentMeasureIndex);
    }


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


    private async yieldToUi(): Promise<void> {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
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

    /* =========================================================================
    *                         diagnostic mode
    *=========================================================================
    */
    setDiagnosticMode(enabled: boolean, persist = true): void {
        this.diagnosticMode = enabled;

        if (persist && typeof window !== "undefined") {
            try {
                window.localStorage.setItem(CursorService.DIAGNOSTIC_STORAGE_KEY, enabled ? "1" : "0");
            } catch {
                // ignore storage failures
            }
        }
        this.debugLog("diagnostic mode updated", { enabled: this.diagnosticMode, persist });
    }

    private readDiagnosticModeFromStorage(): boolean {
        if (typeof window === "undefined") {
            return false;
        }

        try {
            return window.localStorage.getItem(CursorService.DIAGNOSTIC_STORAGE_KEY) === "1";
        } catch {
            return true;
        }
    }

    private debugLog(message: string, data?: unknown): void {
        if (!this.diagnosticMode) {
            return;
        }
        if (data === undefined) {
            console.log(`[cursor][debug] ${message}`);
            return;
        }
        console.log(`[cursor][debug] ${message}`, data);
    }

    ngOnDestroy(): void {
        this.resetSession();
    }

}