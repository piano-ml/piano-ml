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
        private zone: NgZone
    ) { }

    nextNote(note: Note) {
        const next: number = this.osmdArray![this.midiIndex]?.osmdIndex;
        this.moveCursorToOsmdIndex(this.cursor!, next);
        //  while (this.cursor!.NotesUnderCursor().every(this.isSkipable) && !this.cursor!.iterator.EndReached) {
        //      const gN = this.cursor!.GNotesUnderCursor() as GraphicalNote[];
        //      gN.forEach(n => n.setColor("#888", {}));
        //      this.moveCursorToOsmdIndex(this.cursor!, this.cursorIndex + 1);
        //  }

        // const ok = this.isCursorOk(note);
        // console.log(ok, this.cursor!.NotesUnderCursor().map(n => n.Pitch?.getHalfTone()).join(","), "expected", note.midi - 12, note.ticks);
        // if (!ok) {
        //     this.cursor?.next();
        //     //this.moveCursorToOsmdIndex(this.cursor!, next+1); // HACK !
        //     this.cursor!.CursorOptions.color = '#FFB3BA';
        //     this.cursor!.CursorOptions.alpha = 0.3;
        //     this.cursor!.GNotesUnderCursor().forEach(n => n.setColor("#FF0000", {}));

        // } else {
        //     this.cursor!.CursorOptions.color = "#B0F2B4";
        //     this.cursor!.CursorOptions.alpha = 0.6;
        // }
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
    private yieldTick = 0;

    private async yieldToUi(): Promise<void> {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    public async setup(cursor: Cursor, midi: Midi): Promise<boolean> {

        this.feedbackSignal.set({ message: 'Initializing...', percentage: 0 });
        this.yieldTick = 0;
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
        // this.cursor.previous();
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
        let osmdIndex = 0;
        let midiMeasureIndex = 0;
        const osmdArray: any[] = [];
        const osmdMesureSequence = Array.of(...this.midiBarToOsmdMeasure.values())
        const midiMeasureSequence = Array.of(...this.midiBarToOsmdMeasure.keys());
        // this.repetitionInstructions.forEach(instr => {
        //     console.log("repetition instruction", instr);
        // });
        // this.midiBarToOsmdMeasure.forEach((v, k) => {
        //     console.log("midi measure", k, "=> osmd measure", v);
        // });
        // first pass build a simple osmd step sequence
        const feedbackMessage = "building osmd array";
        cursor.reset();
        const osmdSteps: number[] = [];
        let previousOsmdMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
        let osmdMeasureIndex = 0;
        let feedbackCounter = 0;
        while (!cursor.iterator.EndReached) {
            if (cursor.iterator.CurrentMeasure.MeasureNumber !== previousOsmdMeasure) {
                osmdMeasureIndex++;
            }
            osmdSteps.push(osmdMeasureIndex);
            previousOsmdMeasure = cursor.iterator.CurrentMeasure.MeasureNumber;
            cursor.next();
            this.feedback(feedbackMessage, (feedbackCounter++ / this.iteratorSize) * 100);
            await this.yieldToUi();
        }
        cursor.reset();

        // second pass detect last/jump/skippable
        cursor.reset();
        while (!cursor.iterator.EndReached) {
            const firstIter = this.isFirstIterOfMeasure(index, cursor)
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
                osmdIndex: osmdIndex,
                index: index,
                isFirst: firstIter,
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
                cursor.next();
            }
            index++;
            if (lastIter) {
                midiMeasureIndex++;
                this.feedback(feedbackMessage, (midiMeasureIndex / this.midiBarNoteBar.size) * 100);
            }
            await this.yieldToUi();
        }
        cursor.reset();

        // third pass say target cause o.isFirst was not filled if in first pass
        let targetOsmdIndex = 0;
        for (const o of osmdArray) {
            o.osmdIndex = targetOsmdIndex;
            if (o.isJump) {
                // find the first index in osmdSteps having the value o.targetMeasure            
                o.target = osmdSteps.indexOf(o.targetMeasure);;
                targetOsmdIndex = o.target!;
            } else {
                targetOsmdIndex++;
                this.feedback(feedbackMessage, (targetOsmdIndex / this.midiBarNoteBar.size) * 100);
            }
            await this.yieldToUi();
        }
        // fourth pass: handle the special case of the jump being on a skipable note

        // parcours osmdArray from end to start
        let previousO = null;
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
            this.feedback(feedbackMessage, 100 - (i / osmdArray.length) * 100);
            await this.yieldToUi();
        }

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
        cursor.previous();
        const nextMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex; //? cursor.iterator.NextMeasure.measureListIndex : null;
        cursor.next();
        return nextMeasureIndex !== currentMeasureIndex;
    }

    isLastIterOfMeasure(index: number, cursor: Cursor) {
        const currentMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
        cursor.next();
        if (this.cursor!.iterator.EndReached) {
            cursor.previous();
            return true;
        }
        const nextMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex; //? cursor.iterator.NextMeasure.measureListIndex : null;        
        cursor.previous();
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
        let i = 0;
        cursor.reset();
        while (!cursor.iterator.EndReached) {
            const currentIndex = cursor.iterator.CurrentMeasure.measureListIndex;
            const bucket = this.osmdMeasureNoteMap.get(currentIndex);
            if (bucket) {
                bucket.push(...cursor.NotesUnderCursor());
            } else {
                this.osmdMeasureNoteMap.set(currentIndex, cursor.NotesUnderCursor());
            }
            cursor.iterator.moveToNext();
            this.feedback(feedbackMessage, i / this.iteratorSize * 100);
        }
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
        cursor.reset();
        let cursorIndex = 0;
        while (!cursor.iterator.EndReached) {
            const bucket2 = this.osmdCursorIdxNoteMap.get(cursorIndex);
            if (bucket2) {
                bucket2.push(...cursor.NotesUnderCursor());
            } else {
                this.osmdCursorIdxNoteMap.set(cursorIndex, cursor.NotesUnderCursor());
            }
            cursorIndex++;
            cursor.iterator.moveToNext();
            this.feedback(feedbackMessage, (cursorIndex / this.iteratorSize) * 100);
        }
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
        const midiBarNoteMap = new Map<number, any[]>();
        // pass all midi notes add group them by ticks
        midi.tracks.forEach(track => {
            track.notes.forEach(note => {
                const bar = Math.trunc(note.bars);
                const bucket = midiBarNoteMap.get(bar);
                if (bucket) {
                    bucket.push(note);
                } else {
                    midiBarNoteMap.set(bar, [note]);
                }
            });
        });
        this.feedback(feedbackMessage, 50);
        // handle empty measure
        midiBarNoteMap.forEach((v, k) => {
            if (k > 0 && !midiBarNoteMap.has(k - 1)) {
                midiBarNoteMap.set(k - 1, []);
            }
        });
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
        const midiTicksNoteMap = new Map<number, any[]>();
        for (const track of midi.tracks) {
            for (const note of track.notes) {
                const bucket = midiTicksNoteMap.get(note.ticks);
                if (bucket) {
                    bucket.push(note);
                } else {
                    midiTicksNoteMap.set(note.ticks, [note]);
                }
                this.feedback(feedbackMessage, (note.ticks / midi.durationTicks) * 100);
                await this.yieldToUi();
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
            this.feedback(feedbackMessage, (this.iteratorSize / 100) * 100);
            await this.yieldToUi();
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


        const measureIndexToPos = new Map<number, number>();
        osmdMeasureIndices.forEach((measureIndex, index) => {
            measureIndexToPos.set(measureIndex, index);
        });

        const playOrder: number[] = [];
        let pos = 0;
        let steps = 0;
        const maxSteps = Math.max(osmdMeasureIndices.length * 10, 1000);

        this.passCount = 1;
        let activeRepeatAnchorMeasureIndex: number | null = null;
        let activeRepeatMaxEndingNumber: number | null = null;

        while (pos < osmdMeasureIndices.length && steps < maxSteps) {
            steps++;
            this.feedback(feedbackMessage, (steps / maxSteps) * 100);
            await this.yieldToUi();
            const currentMeasureIndex = osmdMeasureIndices[pos];

            const currentVoltaStart = this.repetitionInstructions.find(
                instr =>
                    instr.type === RepetitionInstructionEnum.Ending &&
                    instr.alignment === AlignmentType.Begin &&
                    !(instr.endingIndices || []).includes(this.passCount) &&
                    instr.measureIndex === currentMeasureIndex
            );

            if (currentVoltaStart) {
                const anchor = this.getRepeatAnchorForMeasure(currentVoltaStart.measureIndex);
                const expectedEndingIndex = currentVoltaStart.endingIndices?.[0] ?? 1;
                const currentVoltaEnd = this.repetitionInstructions.find(
                    instr =>
                        instr.type === RepetitionInstructionEnum.Ending &&
                        instr.alignment === AlignmentType.End &&
                        (instr.endingIndices || []).includes(expectedEndingIndex) &&
                        (anchor == null || this.getRepeatAnchorForMeasure(instr.measureIndex) === anchor)
                );

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
                const endingEnd = this.repetitionInstructions.find(
                    instr =>
                        instr.type === RepetitionInstructionEnum.Ending &&
                        instr.alignment === AlignmentType.End &&
                        instr.measureIndex === currentMeasureIndex &&
                        (instr.endingIndices || []).includes(this.passCount) &&
                        this.getRepeatAnchorForMeasure(instr.measureIndex) === activeRepeatAnchorMeasureIndex
                );

                if (endingEnd) {
                    this.passCount = 1;
                    activeRepeatAnchorMeasureIndex = null;
                    activeRepeatMaxEndingNumber = null;
                }
            }

            const backJump = this.repetitionInstructions.find(
                instr =>
                    instr.type === RepetitionInstructionEnum.BackJumpLine &&
                    instr.measureIndex === currentMeasureIndex &&
                    instr.alignment === AlignmentType.End
            );

            if (backJump) {
                const previousStartLine = this.repetitionInstructions
                    .filter(
                        instr =>
                            instr.type === RepetitionInstructionEnum.StartLine &&
                            instr.measureIndex < currentMeasureIndex
                    )
                    .sort((a, b) => b.measureIndex - a.measureIndex)[0];

                const targetMeasure = previousStartLine
                    ? previousStartLine.measureIndex
                    : 0;

                const anchorMeasureIndex = backJump.measureIndex;
                const maxEndingNumber = this.getMaxEndingNumberForAnchor(anchorMeasureIndex);

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
            this.feedback(feedbackMessage, 100);
        }
        this.feedback(feedbackMessage, 90);
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
