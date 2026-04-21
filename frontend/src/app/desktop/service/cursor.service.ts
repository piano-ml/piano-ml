
import { Injectable, signal } from "@angular/core";
import { Midi } from "@tonejs/midi";
import type { Note as MidiNote, Note } from "@tonejs/midi/dist/Note";
import { AlignmentType, Cursor, RepetitionInstruction, RepetitionInstructionEnum, Note as OSMDNote, GraphicalNote, VexFlowGraphicalNote, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { CURSOR_BAD_COLOR, CURSOR_GOOD_COLOR } from "../components/osmd/osmd.config";
import { smithWatermanAlign, smithWatermanAlign2 } from "./smith-waterman";

type CursorAlignmentAlgorithm = "sw1" | "sw2";

interface OsmdArrayElement {
    midiMeasure: number;
    osmdMeasure: number;
    osmdIndex: number;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    isJump: boolean;
    target: number | null;
    targetMeasure: number | null;
    isSkipable: boolean;
    osmdPitches: number[] | null;
    midiPitches: number[] | null;
    midiTicks: number | null;
    midiTicksDuration: number | null;
    midiTime: number | null;
    graphicalObjectId: number[];
    tremolo: boolean;
}



@Injectable({
    providedIn: 'root'
})
export class CursorService {

    private static SKIP_SHORT_NOTE_THRESHOLD = 60;
    private static readonly DIAGNOSTIC_STORAGE_KEY = "cursorService.debug";
    private static readonly UI_YIELD_STEP = 8;

    feedbackSignal = signal<{ message: string; percentage: number } | null>(null); // TODO remove unused signal
    readonly measure = signal<number>(0);
    private diagnosticMode = this.readDiagnosticModeFromStorage();
    private alignmentAlgorithm: CursorAlignmentAlgorithm = "sw2";
    private cursorIndex = 0;

    cursor: Cursor | undefined;
    osmdMeasureCount = 0;
    iteratorSize = 0;

    repetitionInstructions: RepetitionInstruction[] = [];
    osmdArray: OsmdArrayElement[] | undefined;
    midiTicksNoteMap: Map<number, MidiNote[]> = new Map();   // ticks => MidiNote[]    
    audioTimeNoteMapHit: Map<number, { pitch: number, hit: boolean }[]> = new Map();   // audioTime => [{pitch, hit}]
    audioTimeNoteArray: Array<[number, { pitch: number, hit: boolean }[]]> = [];
    osmdCursorIdxNoteMap: Map<number, OSMDNote[]> = new Map();
    osmdCursorIdxToMeasureMap: Map<number, number> = new Map();
    osmdMeasureNoteMap: Map<number, OSMDNote[]> = new Map();
    osmdMeasureSequence: number[] = [];
    midiBarToOsmdMeasure: Map<number, number> = new Map();
    midiTicksToOsmdCursorIndex: Map<number, { osmdIndex: number, osmdMeasure: number }> = new Map(); // ticks => { osmdIndex, osmdMeasure }
    verifyAllElementsOk = false;
    verifyAllElementsOkSignal = signal<boolean>(false);
    osmd: OpenSheetMusicDisplay | undefined;
    maxMidiMeasure = 0;

    public tiltCursor(cursor: Cursor): void {
        this.cursor = cursor;
    }

    public async setup(cursor: Cursor, midi: Midi): Promise<boolean> {
        CursorService.SKIP_SHORT_NOTE_THRESHOLD = (midi.header.ppq | 480) / 8;

        this.cursor = cursor;
        this.feedbackSignal.set({ message: 'Initializing...', percentage: 0 });
        await this.yieldToUi();

        await this.hydrateRepetitionInstructions(this.cursor);
        await this.yieldToUi();

        this.builOsmdMeasureNoteMap(this.cursor);
        await this.yieldToUi();

        await this.buildOsmdMeasureSequence();
        await this.yieldToUi();


        await this.buildMidiTicksNoteMap(midi)
        await this.yieldToUi();

        this.osmdArray = await this.hydrateOsmdArray(this.cursor);
        await this.yieldToUi();


        await this.buildAudioTimeNoteMap(this.osmdArray);
        await this.yieldToUi();


        this.midiTicksToOsmdCursorIndex = await this.linkMidiTicksToCursorIndex();
        let status = this.verify()
        if (!status) {
            if (this.diagnosticMode) {
                console.log("[cursor][mapping] initial alignment failed, starting smith-waterman alignment...");
            }
            this.osmdArray = this.runSelectedAlignment(this.osmdArray)
            this.midiTicksToOsmdCursorIndex = await this.linkMidiTicksToCursorIndex();
            status = this.verify()
            if (status) {
                this.cursor!.CursorOptions.color = 'orange';
            }
        }
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

        setTimeout(() => {
            this.cursor!.next();
            this.cursor!.previous();
        }, 500);
        return status;
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
                if (this.diagnosticMode) {
                    this.cursor!.CursorOptions.color = CURSOR_BAD_COLOR;
                }
                this.cursor!.CursorOptions.type = 3; // measure rectangle
            }
            const newOsmdMeasure = link.osmdMeasure;
            if (newOsmdMeasure !== this.measure()) {
                this.measure.set(newOsmdMeasure);
            }
        } else {
            console.warn("note not found", note.midi, "ticks:", note.ticks);
        }
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
        const osmdMeasureToFirstStepIndex = new Map<number, number>();
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
        return osmdMeasureToFirstStepIndex;

    }

    async initOsmdArray(): Promise<OsmdArrayElement[]> {
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
                if (secondPassCounter % CursorService.UI_YIELD_STEP === 0) {
                    await this.yieldToUi();
                }
                continue;
            }
            notesUnderCursor = (cursor.iterator.CurrentVoiceEntries ?? [])
                .flatMap(voiceEntry => voiceEntry.Notes ?? []);


            const osmdPitches = notesUnderCursor
                .map(n => n.Pitch?.getHalfTone())
                .filter((pitch): pitch is number => pitch != null)
                .map(pitch => this.normalizePitchClass(pitch));
            const graphicalObjectId = notesUnderCursor
                .map(n => n.NoteToGraphicalNoteObjectId)
                .filter((id): id is number => id != null);
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
                midiPitches: null,
                midiTicks: null,
                midiTicksDuration: null,
                midiTime: null,
                graphicalObjectId,
                tremolo: isTremolo
            }
            osmdArray.push(o);
            if (o.isLast && hasMeasureTransition && !isNaturalAdvance) {
                const targetMeasure = osmdMesureSequence[midiMeasureIndex + 1];
                this.moveToMeasure(targetMeasure);
                await setTimeout(() => { }, 0); // yield to let the cursor update
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
                await this.yieldToUi();
            }
        }
        cursor.reset();
        this.feedback(feedbackMessage, 100);
        this.debugStep(feedbackMessage, osmdArray);
        return osmdArray
    }

    debugStep(feedbackMessage: string, osmdArray: OsmdArrayElement[]): void {
        if (this.diagnosticMode) {
            console.groupCollapsed("[cursor][mapping][hydrateOsmdArray]" + feedbackMessage);
            console.table(Array.from(osmdArray));
            console.groupEnd();
        }

    }

    async hydrateTargets(osmdArray: OsmdArrayElement[], osmdMeasureToFirstStepIndex: Map<number, number>): Promise<OsmdArrayElement[]> {
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
                await this.yieldToUi();
            }
        }
        this.debugStep(feedbackMessage, osmdArray); //.filter(o => o.osmdMeasure==8));
        this.feedback(feedbackMessage, 100);
        await this.yieldToUi();
        return osmdArray;
    }


    async hydrateOsmdArray(cursor: Cursor): Promise<OsmdArrayElement[]> {
        // first pass build a simple osmd step sequence
        const osmdMeasureToFirstStepIndex = await this.buildOsmdStepsSequence(cursor);
        // second pass detect last/jump/skippable
        let osmdArray = await this.initOsmdArray();
        // third pass say target cause o.isFirst was not filled if in first pass
        osmdArray = await this.hydrateTargets(osmdArray, osmdMeasureToFirstStepIndex);
        // Final hydration pass: attach MIDI events to the built OSMD array once.
        // This must happen here (and not in linkMidiTicksToCursorIndex) so any
        // subsequent alignment (e.g. smith-waterman) can safely realign midi fields
        // without being overwritten by link rebuilding.
        const sortedTicks = Array.from(this.midiTicksNoteMap.keys()).sort((a, b) => a - b);
        let osmdArrayIndex = 0;
        for (const ticks of sortedTicks) {
            while (osmdArrayIndex < osmdArray.length && osmdArray[osmdArrayIndex].isSkipable) {
                osmdArrayIndex++;
            }
            const currentElement = osmdArray[osmdArrayIndex];
            if (!currentElement) {
                break;
            }
            currentElement.midiTicks = ticks;
            const midiNotesAtTick = this.midiTicksNoteMap.get(ticks) ?? [];
            // TODO skip short note arbitrary...
            if (osmdArray[Math.max(0, osmdArrayIndex - 1)].tremolo && midiNotesAtTick.map(note => note.durationTicks).every(duration => duration < CursorService.SKIP_SHORT_NOTE_THRESHOLD)) {
                continue;
            }
            currentElement.midiPitches = midiNotesAtTick.map(note => note.midi - 12);
            currentElement.midiTicksDuration = midiNotesAtTick.length > 0
                ? Math.max(...midiNotesAtTick.map(note => note.durationTicks))
                : null;
            currentElement.midiTime = midiNotesAtTick.length > 0 ? midiNotesAtTick[0].time : null;
            osmdArrayIndex++;
        }
        this.maxMidiMeasure =  Math.max(...osmdArray.map(e => e.midiMeasure))
        this.debugStep("[main]", osmdArray);
        await this.yieldToUi();
        return osmdArray;
    }

    /**
     * Build a repetition-aware sequence of OSMD measure indices (e.g. [1,2,3,1,2,3,4,...]).
     * This is intentionally computed standalone for future refactors.
     */
    async buildOsmdMeasureSequence(): Promise<number[]> {
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
    async hydrateRepetitionInstructions(cursor: Cursor): Promise<RepetitionInstruction[]> {
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
            if (this.iteratorSize % CursorService.UI_YIELD_STEP === 0) {
                await this.yieldToUi();
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
    buildAudioTimeNoteMap(osmdArray: OsmdArrayElement[]) {
        this.audioTimeNoteMapHit.clear();
        for (const element of osmdArray) {
            if (element.midiTime != null && element.midiPitches != null) {
                const bucket = this.audioTimeNoteMapHit.get(element.midiTime) ?? [];
                for (const pitch of element.midiPitches) {
                    bucket.push({ pitch, hit: false });
                }
                this.audioTimeNoteMapHit.set(element.midiTime, bucket);
            }
        }
        // Génère le tableau trié pour accès rapide par intervalle
        this.audioTimeNoteArray = Array.from(this.audioTimeNoteMapHit.entries()).sort((a, b) => a[0] - b[0]);
        return this.audioTimeNoteMapHit;
    }


    /*
    * Build a map of midi step (ticks) => MidiNote[]
    * @param midi the midi file to process
    * @return this.midiTicksNoteMap
    */
    async buildMidiTicksNoteMap(midi: Midi): Promise<Map<number, MidiNote[]>> {
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
                processedNotes++;
                if (processedNotes % feedbackStep === 0 || processedNotes === totalNotes) {
                    this.feedback(feedbackMessage, (processedNotes / totalNotes) * 100);
                }
                if (processedNotes % CursorService.UI_YIELD_STEP === 0) {
                    await this.yieldToUi();
                }
            }
        }
        this.midiTicksNoteMap = midiTicksNoteMap;
        this.feedback(feedbackMessage, 100);
        return this.midiTicksNoteMap;
    }


    /**
     *  this function first fill osmdArray with midiTicks and notes then output mapMidiTicksToOsmdCursorIndex
     *  
     *  @return this.mapMidiTicksToOsmdCursorIndex will trigger (or not) the cursor advance and back in another service
     */
    async linkMidiTicksToCursorIndex(): Promise<Map<number, { osmdIndex: number, osmdMeasure: number }>> {
        // this will be notre nouvelle sortie
        const link = new Map<number, { osmdIndex: number, osmdMeasure: number }>();
        if (!this.osmdArray || this.osmdArray.length === 0) {
            return link;
        }
        this.osmdArray.forEach(element => {
            if (element.midiTicks !== null) {
                link.set(element.midiTicks!, { osmdIndex: element.osmdIndex, osmdMeasure: element.osmdMeasure });
            }
            this.osmdCursorIdxToMeasureMap.set(element.osmdIndex, element.osmdMeasure);
        });

        this.midiTicksToOsmdCursorIndex = link;
        if (this.diagnosticMode) {
            console.groupCollapsed("[cursor][mapping] mapMidiTicksToOsmdCursorIndex");
            console.table(Array.from(link.entries()).map(([midiTicks, v]) => ({ midiTicks, osmdIndex: v.osmdIndex, osmdMeasure: v.osmdMeasure })));
            console.groupEnd();
        }
        return link;
    }

    /**
     * Verify the mapping by checking if midi ticks and osmd measures are correctly aligned 
     * according to some heuristics.
     */
    verify(): boolean {
        this.yieldToUi();
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
            console.groupCollapsed("[verify] repetitions instructions");
            console.table(this.repetitionInstructions.map((instr) => ({
                ...instr,
                typeText: repetitionTypeLabels[instr.type] ?? String(instr.type),
                endingIndices: instr.endingIndices ? instr.endingIndices.join(",") : "",
            })));
            console.groupEnd();
            // ================================================
            console.groupCollapsed("[verify] osmdMeasureSequence");
            console.table(this.osmdMeasureSequence.map((osmdMeasure, index) => ({ index, osmdMeasure })));
            console.groupEnd();

            console.groupCollapsed("[verify] osmdArray");
            if (this.osmdArray) {
                console.table(
                    this.osmdArray
                        //.slice(0, 100)
                        //.filter(o => (o.isFirst || o.isLast))
                        .map(o => {
                            const osmdPitches = o.osmdPitches ?? [];
                            const midiPitches = o.midiPitches ?? [];
                            const ok = this.isOsmdArrayElementOk(o);
                            // if (!ok) {
                            //     this.colorGraphicalObjectsByIdInRed(o.osmdIndex, o.graphicalObjectId);
                            // }
                            return {
                                ...o,
                                osmdPitches: osmdPitches.join(","),
                                midiPitches: midiPitches.join(","),
                                graphicalObjectId: o.graphicalObjectId.join(","),
                                ok: ok ? "✅" : "❌",
                            };
                        })
                )
            } else {
                console.error("osmdArray is not defined");
            }
            console.groupEnd();
        }
        const osmdArray = this.osmdArray ?? [];
        let firstNotOkIndex: number | null = null;
        let notOkCount = 0;
        const totalCount = osmdArray.length;

        osmdArray.forEach((element, index) => {
            if (!this.isOsmdArrayElementOk(element)) {
                if (firstNotOkIndex == null) {
                    firstNotOkIndex = index;
                }
                notOkCount++;
            }
        });

        this.verifyAllElementsOk = notOkCount === 0;
        this.verifyAllElementsOkSignal.set(this.verifyAllElementsOk);
        if (!this.verifyAllElementsOk && this.diagnosticMode) {
            const notOkPercentage = totalCount > 0
                ? Math.round((notOkCount / totalCount) * 1000) / 10
                : 0;
            console.groupCollapsed("[cursor][verify] KO summary");
            console.table([
                {
                    firstNotOkIndex,
                    notOkCount,
                    notOkPercentage,
                }
            ]);
            console.groupEnd();
            this.cursor!.CursorOptions.color = CURSOR_BAD_COLOR;
        } else {
            this.cursor!.CursorOptions.color = CURSOR_GOOD_COLOR;
        }
        this.yieldToUi();
        return this.verifyAllElementsOk;
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
        const midiIsSubsetOfOsmd = Array.from(midiPitchClasses).every(pitch => osmdPitchClasses.has(pitch));
        return element.isSkipable || midiIsSubsetOfOsmd;
    }



    private findCursorIndexForMeasure(targetMeasure: number): number {
        if (this.osmdCursorIdxToMeasureMap.size === 0) {
            return 0;
        }
        let bestAtOrAfter: number | null = null;
        let lastBefore = 0;
        for (const [cursorIndex, measureIndex] of this.osmdCursorIdxToMeasureMap) {
            if (measureIndex < targetMeasure) {
                lastBefore = cursorIndex;
                continue;
            }
            if (bestAtOrAfter == null || cursorIndex < bestAtOrAfter) {
                bestAtOrAfter = cursorIndex;
            }
        }
        return bestAtOrAfter ?? lastBefore;
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
            return false;
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

}
