import { Injectable, NgZone, inject, signal } from "@angular/core";
import { Midi } from "@tonejs/midi";
import type { Note as MidiNote, Note } from "@tonejs/midi/dist/Note";
import { AlignmentType, Cursor, RepetitionInstruction, RepetitionInstructionEnum, Note as OSMDNote, GraphicalNote } from "opensheetmusicdisplay";



@Injectable({
    providedIn: 'root'
})
export class CursorService {


    cursorIndex = 0;
    midiIndex = 0;

    cursor: Cursor | undefined;
    osmdArray: { osmdMeasure: number; osmdIndex: number; index: number; isLast: boolean; isJump: boolean; target: number | null; targetMeasure: number | null; isSkipable: boolean; }[] | undefined;
    feedbackSignal = signal<{ message: string; percentage: number } | null>(null);;

    constructor(
    ) { }

    nextNote(note: Note) {
        const next: number = this.osmdArray![this.midiIndex]?.osmdIndex;
        this.moveCursorToOsmdIndex(this.cursor!, next);
        //  while (this.cursor!.NotesUnderCursor().every(this.isSkipable) && !this.cursor!.iterator.EndReached) {
        //      const gN = this.cursor!.GNotesUnderCursor() as GraphicalNote[];
        //      gN.forEach(n => n.setColor("#888", {}));
        //      this.moveCursorToOsmdIndex(this.cursor!, this.cursorIndex + 1);
        //  }

        const ok = this.isCursorOk(note);
        //console.log(ok, this.cursor!.NotesUnderCursor().map(n => n.Pitch?.getHalfTone()).join(","), "expected", note.midi - 12, note.ticks);
        if (!ok) {
            //this.cursor?.next();
            //this.moveCursorToOsmdIndex(this.cursor!, next+1); // HACK !
            this.cursor!.CursorOptions.color = '#FFB3BA';
            this.cursor!.CursorOptions.alpha = 0.3;
            this.cursor!.GNotesUnderCursor().forEach(n => n.setColor("#FF0000", {}));
        } else {
            this.cursor!.CursorOptions.color = "#B0F2B4";
            this.cursor!.CursorOptions.alpha = 0.6;
        }
        this.midiIndex++;
    }


    private isCursorOk(note: Note): boolean {
        return this.cursor!.NotesUnderCursor().map(n => n.Pitch?.getHalfTone()).some(n => n === note.midi - 12);
    }

    setCursor(cursor: Cursor) {
        this.cursor = cursor;
    }

    reset() {
        this.midiIndex = 0;
        this.cursorIndex = 0;
        this.cursor?.reset();
    }

    repetitionInstructions: RepetitionInstruction[] = [];
    private passCount = 1; // state for calculating in buildWithRepetitionBar the play order with repetition instructions
    midiBarNoteBar: Map<number, MidiNote[]> = new Map(); // measure (=trunc(note.bar)) => MidiNote[]
    midiTicksNoteMap: Map<number, MidiNote[]> = new Map();   // ticks => MidiNote[]    
    osmdCursorIdxNoteMap: Map<number, OSMDNote[]> = new Map();
    osmdMeasureNoteMap: Map<number, OSMDNote[]> = new Map();

    midiBarToOsmdMeasure: Map<number, number> = new Map();
    midiTicksToOsmdCursorIndex: number[] = []; // ticks => cursor index
    iteratorSize = 0;


    private async yieldToUi(): Promise<void> {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    public async setup(cursor: Cursor, midi: Midi): Promise<boolean> {

        this.feedbackSignal.set({ message: 'Initializing...', percentage: 0 });
        await this.yieldToUi();


        this.cursor = cursor;
        await this.hydrateRepetitionInstructions(cursor);
        await this.yieldToUi();

        this.builOsmdMeasureNoteMap(cursor);
        this.buildMidBarNoteMap(midi)
        await this.yieldToUi();

        await this.builMidiBarToOsmdMeasure();
        await this.yieldToUi();

        this.buildOsmdCursorIdxNoteMap(cursor);
        await this.buildMidiTicksNoteMap(midi)
        await this.yieldToUi();

        this.midiTicksToOsmdCursorIndex = await this.linkMidiTicksToCursorIndex(cursor);

        this.debug();

        const status = this.verify()

        this.repetitionInstructions = [];
        this.midiBarNoteBar.clear();
        this.midiTicksNoteMap.clear();
        this.osmdMeasureNoteMap.clear();
        this.osmdCursorIdxNoteMap.clear();
        return status;
    }

    feedback(message: string, percentage: number) {
        percentage = Math.round(percentage);
        if (percentage % 1 === 0) {
            this.feedbackSignal.set({ message, percentage });
        }
    }

    verify() {
        return this.midiTicksNoteMap.size === this.osmdArray?.filter(o => !o.isSkipable).length;
    }

    debug() {
        console.log("midi notes by measure", this.midiBarNoteBar.size, "osmd notes by measure", this.osmdMeasureNoteMap.size);
        console.log("midi notes by ticks", this.midiTicksNoteMap.size, "osmd notes by cursor index", this.osmdCursorIdxNoteMap.size);
        console.log("midi notes by ticks", this.midiTicksNoteMap.size, "osmd notes by cursor index", this.osmdArray?.filter(o => !o.isSkipable).length);
    }



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
     *  this function build mapMidiTicksToOsmdCursorIndex
     *  this.midiNoteByTicks is our main clock and 
     *  @return this.mapMidiTicksToOsmdCursorIndex will trigger (or not) the cursor advance and back in another service
     */
    async linkMidiTicksToCursorIndex(cursor: Cursor): Promise<number[]> {
        let link: number[] = [];
        this.osmdArray = await this.hydrateOsmdArray(cursor);
        return link;
    }


    async hydrateOsmdArray(cursor: Cursor): Promise<{ midiMeasure: number, osmdMeasure: number, osmdIndex: number, index: number, isLast: boolean, isJump: boolean, target: number | null, targetMeasure: number | null, isSkipable: boolean, }[]> {
        let index = 0;
        let midiMeasureIndex = 0;
        const osmdArray: any[] = [];
        const osmdMesureSequence = Array.of(...this.midiBarToOsmdMeasure.values())
        const uiYieldStep = 64;
        const feedbackStep = Math.max(1, Math.floor(this.iteratorSize / 100));
        this.repetitionInstructions.forEach(instr => {
            console.log( instr);
        });
        // this.midiBarToOsmdMeasure.forEach((v, k) => {
        //     console.log("midi measure", k, "=> osmd measure", v);
        // });
        // first pass build a simple osmd step sequence
        let feedbackMessage = "building sheet cursor (1/4)";
        cursor.reset();
        const osmdSteps: number[] = [];
        const osmdMeasureToFirstStepIndex = new Map<number, number>();
        let previousOsmdMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
        let osmdMeasureIndex = 0;
        let feedbackCounter = 0;
        while (!cursor.iterator.EndReached) {
            if (cursor.iterator.CurrentMeasure.MeasureNumber !== previousOsmdMeasure) {
                osmdMeasureIndex++;
            }
            if (!osmdMeasureToFirstStepIndex.has(osmdMeasureIndex)) {
                osmdMeasureToFirstStepIndex.set(osmdMeasureIndex, osmdSteps.length);
            }
            osmdSteps.push(osmdMeasureIndex);
            previousOsmdMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
            cursor.iterator.moveToNext();
            feedbackCounter++;
            if (feedbackCounter % feedbackStep === 0) {
                this.feedback(feedbackMessage, (feedbackCounter / this.iteratorSize) * 100);
            }
            if (feedbackCounter % uiYieldStep === 0) {
                await this.yieldToUi();
            }
        }
        this.feedback(feedbackMessage, 100);
        cursor.reset();
        
        // second pass detect last/jump/skippable
        feedbackMessage = "building sheet cursor (2/4)";
        let secondPassCounter = 0;
        while (!cursor.iterator.EndReached) {
            const lastIter = this.isLastIterOfMeasure(index, cursor)
            const osmdMesureIndex = cursor.iterator.CurrentMeasure.MeasureNumber;
            const isJump = lastIter && osmdMesureSequence[midiMeasureIndex] + 1 !== osmdMesureSequence[midiMeasureIndex + 1];
            let target = null;
            let targetMeasure = null;
            if (isJump) {
                targetMeasure = osmdMesureSequence[midiMeasureIndex + 1];
            }

            const o: any = {
                midiMeasure: midiMeasureIndex,
                osmdMeasure: osmdMesureIndex,
                osmdIndex: 0,
                index: index,
                isLast: lastIter,
                isSkipable: cursor.NotesUnderCursor().every(this.isSkipable),
                isJump: isJump,
                target: target,
                targetMeasure: targetMeasure
            }
            osmdArray.push(o);

            const currentMeasureValue = this.midiBarToOsmdMeasure.get(midiMeasureIndex)! + 1;
            const nextMeasureValue = this.midiBarToOsmdMeasure.get(midiMeasureIndex + 1);
            if (o.isLast && currentMeasureValue != null && nextMeasureValue != null
                && currentMeasureValue !== nextMeasureValue) {
                targetMeasure = osmdMesureSequence[midiMeasureIndex + 1];
                this.moveToMeasure(targetMeasure);
            } else {
                cursor.iterator.moveToNext();
            }
            index++;
            secondPassCounter++;
            if (lastIter) {
                midiMeasureIndex++;
                this.feedback(feedbackMessage, (midiMeasureIndex / this.midiBarNoteBar.size) * 100);
            }
            if (secondPassCounter % uiYieldStep === 0) {
                await this.yieldToUi();
            }
        }
        this.feedback(feedbackMessage, 100);
        cursor.reset();

        // third pass say target cause o.isFirst was not filled if in first pass
        feedbackMessage = "building sheet cursor (3/4)";        
        let targetOsmdIndex = 0;
        let thirdPassCounter = 0;
        for (const o of osmdArray) {
            o.osmdIndex = targetOsmdIndex;
            if (o.isJump) {
                // find the first index in osmdSteps having the value o.targetMeasure            
                o.target = osmdMeasureToFirstStepIndex.get(o.targetMeasure) ?? -1;
                targetOsmdIndex = o.target!;
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
        this.feedback(feedbackMessage, 100);
        // fourth pass: handle the special case of the jump being on a skipable note
        feedbackMessage = "building sheet cursor (4/4)";

        // parcours osmdArray from end to start
        let previousO = null;
        let fourthPassCounter = 0;
        for (let i = osmdArray.length - 1; i >= 0; i--) {
            const o = osmdArray[i];

            if (o.isJump && o.isSkipable) {
                // set the previous to isJump to true and target to o.target 
                previousO = o;
            } else {
                if (previousO) {
                    o.isJump = true;
                    o.target = previousO.target;
                    o.targetMeasure = previousO.targetMeasure;
                }
                if (!o.isSkipable && previousO) {
                    previousO = null;
                }

            }
            fourthPassCounter++;
            if (fourthPassCounter % feedbackStep === 0 || i === 0) {
                this.feedback(feedbackMessage, (fourthPassCounter / osmdArray.length) * 100);
            }
            if (fourthPassCounter % uiYieldStep === 0) {
                await this.yieldToUi();
            }
        }
        this.feedback(feedbackMessage, 100);

        return osmdArray.filter(o => !o.isSkipable);
    }

    moveToMeasure(targetMeasure: number) {
        if (this.cursor!.iterator.CurrentMeasure.measureListIndex > targetMeasure) {
            this.backToMeasure(targetMeasure);
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
        while (cursor.iterator.CurrentMeasure.measureListIndex > measureIndex && !cursor.iterator.FrontReached) {
            cursor.previousMeasure();
        }
    }

    /**
     * Move the cursor forward to a specific measure
     */
    private nextToMeasure(measureIndex: number): void {
        const cursor = this.cursor!;
        while (cursor.iterator.CurrentMeasure.measureListIndex < measureIndex && !cursor.iterator.EndReached) {
            cursor.nextMeasure();
        }
    }

    isFirstIterOfMeasure(index: number, cursor: Cursor) {
        const currentMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
        cursor.iterator.moveToPrevious();
        const nextMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex; //? cursor.iterator.NextMeasure.measureListIndex : null;
        cursor.iterator.moveToNext();
        return nextMeasureIndex !== currentMeasureIndex;
    }

    isLastIterOfMeasure(index: number, cursor: Cursor) {
        const currentMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
        cursor.iterator.moveToNext();
        if (this.cursor!.iterator.EndReached) {
            cursor.iterator.moveToPrevious();
            return true;
        }
        const nextMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex; //? cursor.iterator.NextMeasure.measureListIndex : null;        
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
            || (n.NoteTie && n.NoteTie?.Notes.at(0)?.NoteToGraphicalNoteObjectId !== n.NoteToGraphicalNoteObjectId)
            || n.IsCueNote;
        return r;
    }

    /**
     * build a map of measure index => osmd notes under cursor using the cursor to extract this information
     * @param cursor  
     * @return this.osmdMeasureNoteMap Map<number, OSMDNote[]> measure index => osmd notes under cursor
     */
    builOsmdMeasureNoteMap(cursor: Cursor): Map<number, OSMDNote[]> {
        const feedbackMessage = "building osmd measure note map";
        this.feedback(feedbackMessage, 0);
        const totalSteps = Math.max(1, this.iteratorSize);
        const feedbackStep = Math.max(1, Math.floor(totalSteps / 100));
        let step = 0;
        cursor.reset();
        while (!cursor.iterator.EndReached) {
            const currentIndex = cursor.iterator.CurrentMeasure.measureListIndex;
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
        this.feedback(feedbackMessage, 100);
        cursor.reset();
        return this.osmdMeasureNoteMap;
    }

    /**
     * build a map of cursor index => osmd notes under cursor using the cursor to extract this information
     * @param cursor 
     * @return this.osmdCursorIdxNoteMap Map<number, OSMDNote[]> cursor index => osmd notes under cursor
     */
    buildOsmdCursorIdxNoteMap(cursor: Cursor): Map<number, OSMDNote[]> {
        const feedbackMessage = "building osmd cursor index note map";
        this.feedback(feedbackMessage, 0);
        const totalSteps = Math.max(1, this.iteratorSize);
        const feedbackStep = Math.max(1, Math.floor(totalSteps / 100));
        cursor.reset();
        let cursorIndex = 0;
        while (!cursor.iterator.EndReached) {
            const notesUnderCursor = cursor.NotesUnderCursor();
            const bucket2 = this.osmdCursorIdxNoteMap.get(cursorIndex);
            if (bucket2) {
                bucket2.push(...notesUnderCursor);
            } else {
                this.osmdCursorIdxNoteMap.set(cursorIndex, notesUnderCursor);
            }
            cursorIndex++;
            cursor.iterator.moveToNext();
            if (cursorIndex % feedbackStep === 0 || cursorIndex === totalSteps) {
                this.feedback(feedbackMessage, (cursorIndex / totalSteps) * 100);
            }
        }
        this.feedback(feedbackMessage, 100);
        cursor.reset();
        return this.osmdCursorIdxNoteMap;
    }


    /*
    * Build a map of midi step (ticks) to sheet step (cursor index) using measureMath.trunc(note.bars) as a bridge
    * @param midi the midi file to process
    * @return this.midiToSheet Map<number, number> midi measure index => osmd measure index
    */
    buildMidBarNoteMap(midi: Midi): Map<number, MidiNote[]> {
        const feedbackMessage = "building midi measure note map";
        this.feedback(feedbackMessage, 0);
        const midiBarNoteMap = new Map<number, MidiNote[]>();
        let maxBar = -1;

        // group midi notes by bar
        for (const track of midi.tracks) {
            for (const note of track.notes) {
                const bar = Math.trunc(note.bars);
                if (bar > maxBar) {
                    maxBar = bar;
                }
                const bucket = midiBarNoteMap.get(bar);
                if (bucket) {
                    bucket.push(note);
                } else {
                    midiBarNoteMap.set(bar, [note]);
                }
            }
        }
        this.feedback(feedbackMessage, 50);

        // ensure contiguous bars from 0 to maxBar
        for (let bar = 0; bar <= maxBar; bar++) {
            if (!midiBarNoteMap.has(bar)) {
                midiBarNoteMap.set(bar, []);
            }
        }

        this.midiBarNoteBar = midiBarNoteMap;
        this.feedback(feedbackMessage, 100);
        return this.midiBarNoteBar;
    }

    /*
    * Build a map of midi step (ticks) => MidiNote[]
    * @param midi the midi file to process
    * @return this.midiTicksNoteMap
    */
    async buildMidiTicksNoteMap(midi: Midi): Promise<Map<number, MidiNote[]>> {
        const feedbackMessage = "building midi ticks note map";
        this.feedback(feedbackMessage, 0);
        const midiTicksNoteMap = new Map<number, MidiNote[]>();
        const totalNotes = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0);
        const uiYieldStep = 256;
        const feedbackStep = Math.max(1, Math.floor(totalNotes / 100));
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
                if (processedNotes % uiYieldStep === 0) {
                    await this.yieldToUi();
                }
            }
        }
        this.midiTicksNoteMap = midiTicksNoteMap;
        this.feedback(feedbackMessage, 100);
        return this.midiTicksNoteMap;
    }

    /**
     * construst the list of repetition instructions reading info from osmd sheet via the cursor
     * @param cursor 
     * @return repetitionInstructions the list of repetition instructions
     */
    async hydrateRepetitionInstructions(cursor: Cursor): Promise<RepetitionInstruction[]> {
        const feedbackMessage = "building voltas list";
        this.feedback(feedbackMessage, 0)
        this.repetitionInstructions = [];
        this.iteratorSize = 0;
        const uiYieldStep = 64;
        const feedbackStep = 32;

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
                this.feedback(feedbackMessage, Math.min(99, this.iteratorSize));
            }
            if (this.iteratorSize % uiYieldStep === 0) {
                await this.yieldToUi();
            }
        }
        this.feedback(feedbackMessage, 100)
        // deduplicate this.repetitionInstructions
        this.repetitionInstructions = Array.from(
            new Map(this.repetitionInstructions.map(instr => [instr, instr])).values()
        );
        return this.repetitionInstructions;
    }





    /**
     * build the map of midi measure index, trunc(note.bar), to osmd measure index 
    * taking into account repetition instructions (repeats, volta, D.S., D.C., etc.)
    * @returns this.midiToSheet 
    */
    async builMidiBarToOsmdMeasure(): Promise<Map<number, number>> {
        const feedbackMessage = "building midi to osmd measure map";
        const midiMeasureIndices = Array.from(this.midiBarNoteBar.keys()).sort((a, b) => a - b);
        const osmdMeasureIndices = Array.from(this.osmdMeasureNoteMap.keys()).sort((a, b) => a - b);
        const repetitionInstructions = this.repetitionInstructions;


        const measureIndexToPos = new Map<number, number>();
        osmdMeasureIndices.forEach((measureIndex, index) => {
            measureIndexToPos.set(measureIndex, index);
        });

        const endingBeginsByMeasure = new Map<number, RepetitionInstruction[]>();
        const endingEndsByMeasure = new Map<number, RepetitionInstruction[]>();
        const endingEnds: RepetitionInstruction[] = [];
        const backJumpByMeasure = new Map<number, RepetitionInstruction>();
        const startLineMeasures: number[] = [];
        const backJumpAnchors: number[] = [];

        for (const instr of repetitionInstructions) {
            if (instr.type === RepetitionInstructionEnum.Ending && instr.alignment === AlignmentType.Begin) {
                const existing = endingBeginsByMeasure.get(instr.measureIndex);
                if (existing) {
                    existing.push(instr);
                } else {
                    endingBeginsByMeasure.set(instr.measureIndex, [instr]);
                }
            }

            if (instr.type === RepetitionInstructionEnum.Ending && instr.alignment === AlignmentType.End) {
                endingEnds.push(instr);
                const existing = endingEndsByMeasure.get(instr.measureIndex);
                if (existing) {
                    existing.push(instr);
                } else {
                    endingEndsByMeasure.set(instr.measureIndex, [instr]);
                }
            }

            if (instr.type === RepetitionInstructionEnum.BackJumpLine && instr.alignment === AlignmentType.End) {
                if (!backJumpByMeasure.has(instr.measureIndex)) {
                    backJumpByMeasure.set(instr.measureIndex, instr);
                }
                backJumpAnchors.push(instr.measureIndex);
            }

            if (instr.type === RepetitionInstructionEnum.StartLine) {
                startLineMeasures.push(instr.measureIndex);
            }
        }

        backJumpAnchors.sort((a, b) => a - b);
        startLineMeasures.sort((a, b) => a - b);

        const repeatAnchorCache = new Map<number, number | null>();
        const getRepeatAnchorCached = (measureIndex: number): number | null => {
            if (repeatAnchorCache.has(measureIndex)) {
                return repeatAnchorCache.get(measureIndex)!;
            }

            let low = 0;
            let high = backJumpAnchors.length;
            while (low < high) {
                const mid = (low + high) >> 1;
                if (backJumpAnchors[mid] <= measureIndex) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }

            const anchor = low > 0 ? backJumpAnchors[low - 1] : null;
            repeatAnchorCache.set(measureIndex, anchor);
            return anchor;
        };

        const NO_ANCHOR = -1;
        const endingEndsByAnchor = new Map<number, RepetitionInstruction[]>();
        const maxEndingNumberByAnchor = new Map<number, number>();
        for (const endingEnd of endingEnds) {
            const anchor = getRepeatAnchorCached(endingEnd.measureIndex) ?? NO_ANCHOR;
            const existing = endingEndsByAnchor.get(anchor);
            if (existing) {
                existing.push(endingEnd);
            } else {
                endingEndsByAnchor.set(anchor, [endingEnd]);
            }
        }

        for (const instr of repetitionInstructions) {
            if (instr.type !== RepetitionInstructionEnum.Ending) {
                continue;
            }
            const anchor = getRepeatAnchorCached(instr.measureIndex);
            if (anchor == null) {
                continue;
            }
            const endingMax = Math.max(...(instr.endingIndices || [1]));
            maxEndingNumberByAnchor.set(anchor, Math.max(maxEndingNumberByAnchor.get(anchor) ?? 1, endingMax));
        }

        const previousStartLineByMeasure = new Map<number, number | null>();
        let lastStart: number | null = null;
        let startLinePointer = 0;
        for (const measureIndex of osmdMeasureIndices) {
            while (startLinePointer < startLineMeasures.length && startLineMeasures[startLinePointer] < measureIndex) {
                lastStart = startLineMeasures[startLinePointer];
                startLinePointer++;
            }
            previousStartLineByMeasure.set(measureIndex, lastStart);
        }

        const playOrder: number[] = [];
        let pos = 0;
        let steps = 0;
        const maxSteps = Math.max(osmdMeasureIndices.length * 10, 1000);
        const uiYieldStep = 64;
        const feedbackStep = Math.max(1, Math.floor(maxSteps / 100));

        this.passCount = 1;
        let activeRepeatAnchorMeasureIndex: number | null = null;
        let activeRepeatMaxEndingNumber: number | null = null;

        while (pos < osmdMeasureIndices.length && steps < maxSteps) {
            steps++;
            if (steps % feedbackStep === 0 || steps === maxSteps) {
                this.feedback(feedbackMessage, (steps / maxSteps) * 100);
            }
            if (steps % uiYieldStep === 0) {
                await this.yieldToUi();
            }
            const currentMeasureIndex = osmdMeasureIndices[pos];

            const currentVoltaStart = endingBeginsByMeasure
                .get(currentMeasureIndex)
                ?.find(instr => !(instr.endingIndices || []).includes(this.passCount));

            if (currentVoltaStart) {
                const anchor = getRepeatAnchorCached(currentVoltaStart.measureIndex);
                const expectedEndingIndex = currentVoltaStart.endingIndices?.[0] ?? 1;
                const currentVoltaEnd = anchor == null
                    ? endingEnds.find(instr => (instr.endingIndices || []).includes(expectedEndingIndex))
                    : endingEndsByAnchor
                        .get(anchor)
                        ?.find(instr => (instr.endingIndices || []).includes(expectedEndingIndex));

                const jumpToMeasure = (currentVoltaEnd?.measureIndex ?? currentVoltaStart.measureIndex) + 1;
                const jumpPos = measureIndexToPos.get(jumpToMeasure);
                pos = jumpPos != null ? jumpPos : pos + 1;
                continue;
            }

            playOrder.push(currentMeasureIndex);

            if (
                activeRepeatAnchorMeasureIndex != null &&
                activeRepeatMaxEndingNumber != null &&
                this.passCount === activeRepeatMaxEndingNumber
            ) {
                const endingEnd = endingEndsByMeasure
                    .get(currentMeasureIndex)
                    ?.find(
                        instr =>
                            (instr.endingIndices || []).includes(this.passCount) &&
                            getRepeatAnchorCached(instr.measureIndex) === activeRepeatAnchorMeasureIndex
                    );

                if (endingEnd) {
                    this.passCount = 1;
                    activeRepeatAnchorMeasureIndex = null;
                    activeRepeatMaxEndingNumber = null;
                }
            }

            const backJump = backJumpByMeasure.get(currentMeasureIndex);

            if (backJump) {
                const targetMeasure = previousStartLineByMeasure.get(currentMeasureIndex) ?? 0;

                const anchorMeasureIndex = backJump.measureIndex;
                if (
                    activeRepeatAnchorMeasureIndex != null &&
                    activeRepeatAnchorMeasureIndex !== anchorMeasureIndex
                ) {
                    this.passCount = 1;
                }
                const maxEndingNumber = maxEndingNumberByAnchor.get(anchorMeasureIndex) ?? 2;

                activeRepeatAnchorMeasureIndex = anchorMeasureIndex;
                activeRepeatMaxEndingNumber = maxEndingNumber;

                if (this.passCount < maxEndingNumber) {
                    const targetPos = measureIndexToPos.get(targetMeasure) ?? 0;
                    pos = targetPos;
                    this.passCount++;
                    continue;
                }
            }
            pos++;
        }
        if (steps >= maxSteps) {
            console.warn("Stopped play order construction due to step limit", { steps, maxSteps });
        }

        const midiBarToOsmdMeasure = new Map<number, number>();
        const lastSheetMeasure = playOrder.length > 0
            ? playOrder[playOrder.length - 1]
            : osmdMeasureIndices[osmdMeasureIndices.length - 1];

        for (let i = 0; i < midiMeasureIndices.length; i++) {
            const sheetMeasure = playOrder[i] ?? lastSheetMeasure;
            midiBarToOsmdMeasure.set(midiMeasureIndices[i], sheetMeasure);
        }
        this.feedback(feedbackMessage, 100);
        this.midiBarToOsmdMeasure = midiBarToOsmdMeasure;
        return midiBarToOsmdMeasure;
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
            return 2;
        }

        return Math.max(
            ...anchoredEndings.flatMap(e => e.endingIndices || [1])
        );
    }
}
