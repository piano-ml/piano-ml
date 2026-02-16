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
    readonly measure = signal<number>(0);
    private diagnosticMode = false;
    repetitionInstructions: RepetitionInstruction[] = [];
    private passCount = 1; // state for calculating in buildWithRepetitionBar the play order with repetition instructions
    midiBarNoteBar: Map<number, MidiNote[]> = new Map(); // measure (=trunc(note.bar)) => MidiNote[]
    midiTicksNoteMap: Map<number, MidiNote[]> = new Map();   // ticks => MidiNote[]    
    osmdCursorIdxNoteMap: Map<number, OSMDNote[]> = new Map();
    osmdCursorIdxToMeasureMap: Map<number, number> = new Map();
    osmdMeasureNoteMap: Map<number, OSMDNote[]> = new Map();

    midiBarToOsmdMeasure: Map<number, number> = new Map();
    midiTicksToOsmdCursorIndex: number[] = []; // ticks => cursor index
    iteratorSize = 0;
    osmdMeasureCount = 0;

    nextNote(note: Note) {
        const mappedCursorIndex = this.midiTicksToOsmdCursorIndex[note.ticks];
        const fallbackCursorIndex = this.osmdArray?.[this.midiIndex]?.osmdIndex;
        const next = this.resolveBestCursorIndexForTick(note.ticks, mappedCursorIndex, fallbackCursorIndex, this.cursorIndex);
        if (next == null) {
            return;
        }
        this.moveCursorToOsmdIndex(this.cursor!, next);
        const newOsmdMeasure = this.osmdArray?.[this.midiIndex]?.osmdMeasure || 0;
        if (newOsmdMeasure !== this.measure()) {
            this.measure.set(newOsmdMeasure);
        }
        // while (
        //     this.cursor!.NotesUnderCursor().every(this.isSkipable)
        //     && !this.cursor!.iterator.EndReached
        //     && !this.hasExpectedAtCursorIndexForTick(this.cursorIndex, note.ticks)
        // ) {
        //     const gN = this.cursor!.GNotesUnderCursor() as GraphicalNote[];
        //     gN.forEach(n => n.setColor("#888", {}));
        //     this.moveCursorToOsmdIndex(this.cursor!, this.cursorIndex + 1);
        // }

        let ok = this.isCursorOkForTick(note);
        if (!ok && mappedCursorIndex != null && this.hasExpectedAtCursorIndexForTick(mappedCursorIndex, note.ticks)) {
            this.forceCursorToIndex(this.cursor!, mappedCursorIndex);
            ok = this.isCursorOkForTick(note);
        }
        if (!ok && this.diagnosticMode) {
            this.logMismatchDiagnostic(note, mappedCursorIndex, this.osmdArray?.[this.midiIndex]?.osmdIndex);
        }
        if (!ok) {
            //this.cursor?.next();
            //this.moveCursorToOsmdIndex(this.cursor!, next+1); // HACK !
            this.cursor!.CursorOptions.color = '#FFB3BA';
            this.cursor!.CursorOptions.alpha = 0.3;
            this.cursor!.GNotesUnderCursor().forEach(n => n.setColor("#FF0000", {}));
        } else {
            this.cursor!.CursorOptions.color = "#B0F2B4";
            this.cursor!.CursorOptions.alpha = 1;
        }
        this.midiIndex++;
    }

    private resolveBestCursorIndexForTick(
        ticks: number,
        mappedCursorIndex: number | undefined,
        fallbackCursorIndex: number | undefined,
        defaultCursorIndex: number,
    ): number {
        const mappedHasExpected =
            mappedCursorIndex != null && this.hasExpectedAtCursorIndexForTick(mappedCursorIndex, ticks);
        if (mappedHasExpected) {
            console.log("mapped")
            return mappedCursorIndex!;
        }

        const fallbackHasExpected =
            fallbackCursorIndex != null && this.hasExpectedAtCursorIndexForTick(fallbackCursorIndex, ticks);
        if (fallbackHasExpected) {
            console.log("fallback")
            return fallbackCursorIndex!;
        }

        const nearbyFromCurrent = this.findNearbyExpectedCursorIndexForTick(defaultCursorIndex, ticks, 2, 6);
        if (nearbyFromCurrent != null) {
            console.log("nearby from current")
            return nearbyFromCurrent;
        }

        const nearbyFromFallback =
            fallbackCursorIndex != null
                ? this.findNearbyExpectedCursorIndexForTick(fallbackCursorIndex, ticks, 2, 6)
                : undefined;
        if (nearbyFromFallback != null) {
            console.log("nearby from fallback")
            return nearbyFromFallback;
        }


        const nearbyFromMapped =
            mappedCursorIndex != null
                ? this.findNearbyExpectedCursorIndexForTick(mappedCursorIndex, ticks, 2, 6)
                : undefined;
        if (nearbyFromMapped != null) {
            console.log("nearby from mapped")
            return nearbyFromMapped;
        }





        return mappedCursorIndex ?? fallbackCursorIndex ?? defaultCursorIndex;
    }

    private findNearbyExpectedCursorIndexForTick(
        centerIndex: number,
        ticks: number,
        maxBackward: number,
        maxForward: number,
    ): number | undefined {
        for (let offset = 0; offset <= maxForward; offset++) {
            const idx = centerIndex + offset;
            if (this.hasExpectedAtCursorIndexForTick(idx, ticks)) {
                return idx;
            }
        }

        for (let offset = 1; offset <= maxBackward; offset++) {
            const idx = centerIndex - offset;
            if (idx < 0) {
                break;
            }
            if (this.hasExpectedAtCursorIndexForTick(idx, ticks)) {
                return idx;
            }
        }

        return undefined;
    }

    private logMismatchDiagnostic(note: Note, mappedCursorIndex: number | undefined, fallbackCursorIndex: number | undefined): void {
        const expectedHalfTone = note.midi - 12;
        const midiNote = note as MidiNote;
        const midiBar = Number.isFinite(midiNote.bars) ? Math.trunc(midiNote.bars) : null;
        const around: { idx: number; pitches: (number | undefined)[]; hasExpected: boolean; }[] = [];

        for (let i = Math.max(0, this.cursorIndex - 4); i <= this.cursorIndex + 4; i++) {
            const notes = this.osmdCursorIdxNoteMap.get(i) ?? [];
            const pitches = notes.map(n => n.Pitch?.getHalfTone());
            around.push({
                idx: i,
                pitches,
                hasExpected: pitches.some(p => p === expectedHalfTone),
            });
        }

        console.groupCollapsed(`[cursor][mismatch] ticks=${note.ticks} expected=${expectedHalfTone}`);
        console.log({
            midiIndex: this.midiIndex,
            cursorIndex: this.cursorIndex,
            mappedCursorIndex,
            fallbackCursorIndex,
            ticks: note.ticks,
            midiBar,
            noteMidi: note.midi,
        });
        console.table(around);
        console.groupEnd();
    }

    private isCursorOk(note: Note): boolean {
        return this.cursor!.NotesUnderCursor().map(n => n.Pitch?.getHalfTone()).some(n => n === note.midi - 12);
    }

    private isCursorOkForTick(note: Note): boolean {
        const notesAtTick = this.midiTicksNoteMap.get(note.ticks);
        if (!notesAtTick || notesAtTick.length === 0) {
            return this.isCursorOk(note);
        }

        const expectedHalfTones = new Set(notesAtTick.map(n => n.midi - 12));

        const mappedNotesAtCurrentIndex = this.osmdCursorIdxNoteMap.get(this.cursorIndex);
        if (mappedNotesAtCurrentIndex && mappedNotesAtCurrentIndex.length > 0) {
            const matchesMappedIndex = mappedNotesAtCurrentIndex.some(n => {
                const halfTone = n.Pitch?.getHalfTone();
                return halfTone != null && expectedHalfTones.has(halfTone);
            });
            if (matchesMappedIndex) {
                return true;
            }
        }

        const cursorHalfTones = this.cursor!.NotesUnderCursor().map(n => n.Pitch?.getHalfTone());
        return cursorHalfTones.some(halfTone => halfTone != null && expectedHalfTones.has(halfTone));
    }

    private hasExpectedAtCursorIndexForTick(cursorIndex: number, ticks: number): boolean {
        const notesAtTick = this.midiTicksNoteMap.get(ticks);
        const notesAtCursorIndex = this.osmdCursorIdxNoteMap.get(cursorIndex);
        if (!notesAtTick || notesAtTick.length === 0 || !notesAtCursorIndex || notesAtCursorIndex.length === 0) {
            return false;
        }

        const expectedHalfTones = new Set(notesAtTick.map(n => n.midi - 12));
        return notesAtCursorIndex.some(n => {
            const halfTone = n.Pitch?.getHalfTone();
            return halfTone != null && expectedHalfTones.has(halfTone);
        });
    }

    private forceCursorToIndex(cursor: Cursor, targetIndex: number): void {
        cursor.reset();
        this.cursorIndex = 0;
        while (this.cursorIndex < targetIndex && !cursor.iterator.EndReached) {
            cursor.next();
            this.cursorIndex++;
        }
    }

    setCursor(cursor: Cursor) {
        this.cursor = cursor;
    }

    reset(start: number = 0) {
        const cursor = this.cursor;
        if (!cursor) {
            this.midiIndex = 0;
            this.cursorIndex = 0;
            this.measure.set(0);
            return;
        }

        const targetMeasure = Math.max(0, Math.trunc(start - 1));

        this.midiIndex = 0;
        this.cursorIndex = 0;
        cursor.reset();

        const targetCursorIndex = this.findCursorIndexForMeasure(targetMeasure);
        this.moveCursorToOsmdIndex(cursor, targetCursorIndex);

        const reachedMeasure = this.osmdCursorIdxToMeasureMap.get(this.cursorIndex) ?? targetMeasure;
        //this.measure.set(reachedMeasure);

        if (this.osmdArray && this.osmdArray.length > 0) {
            const mappedMidiIndex = this.osmdArray.findIndex(step => step.osmdIndex >= targetCursorIndex);
            this.midiIndex = mappedMidiIndex >= 0 ? mappedMidiIndex : this.osmdArray.length - 1;
        }
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

        const status = this.verify()

        this.repetitionInstructions = [];
        this.midiBarNoteBar.clear();
        this.osmdMeasureNoteMap.clear();
        setTimeout(() => {
        this.cursor!.next();
        this.cursor!.previous();        
        }, 100);
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
        const link: number[] = [];
        this.osmdArray = await this.hydrateOsmdArray(cursor);
        if (!this.osmdArray || this.osmdArray.length === 0) {
            return link;
        }

        const sortedTicks = Array.from(this.midiTicksNoteMap.keys()).sort((a, b) => a - b);

        type TickInfo = { ticks: number; midiBar: number; expectedHalfTones: Set<number> };
        const ticksByMidiBar = new Map<number, TickInfo[]>();
        for (const ticks of sortedTicks) {
            const notesAtTick = this.midiTicksNoteMap.get(ticks) ?? [];
            const midiBar = notesAtTick.length > 0 ? Math.trunc(notesAtTick[0].bars) : 0;
            const tickInfo: TickInfo = {
                ticks,
                midiBar,
                expectedHalfTones: new Set(notesAtTick.map(n => n.midi - 12)),
            };
            const bucket = ticksByMidiBar.get(midiBar);
            if (bucket) {
                bucket.push(tickInfo);
            } else {
                ticksByMidiBar.set(midiBar, [tickInfo]);
            }
        }

        const cursorIndicesByMeasure = new Map<number, number[]>();
        for (const [cursorIndex, measureIndex] of this.osmdCursorIdxToMeasureMap) {
            const notes = this.osmdCursorIdxNoteMap.get(cursorIndex) ?? [];
            if (notes.length === 0) {
                continue;
            }
            const bucket = cursorIndicesByMeasure.get(measureIndex);
            if (bucket) {
                bucket.push(cursorIndex);
            } else {
                cursorIndicesByMeasure.set(measureIndex, [cursorIndex]);
            }
        }
        cursorIndicesByMeasure.forEach(indices => indices.sort((a, b) => a - b));

        let lastAssignedCursorIndex = 0;
        const midiBars = Array.from(ticksByMidiBar.keys()).sort((a, b) => a - b);

        for (const midiBar of midiBars) {
            const tickInfos = ticksByMidiBar.get(midiBar)!;
            const osmdMeasure = this.midiBarToOsmdMeasure.get(midiBar);
            if (osmdMeasure == null) {
                for (const tickInfo of tickInfos) {
                    link[tickInfo.ticks] = lastAssignedCursorIndex;
                }
                continue;
            }

            const measureCursorIndices = cursorIndicesByMeasure.get(osmdMeasure) ?? [];
            if (measureCursorIndices.length === 0) {
                for (const tickInfo of tickInfos) {
                    link[tickInfo.ticks] = lastAssignedCursorIndex;
                }
                continue;
            }

            let measurePos = 0;
            const searchWindow = Math.min(6, Math.max(2, measureCursorIndices.length - 1));

            for (let i = 0; i < tickInfos.length; i++) {
                const tickInfo = tickInfos[i];
                let chosenPos = i === 0 ? 0 : measurePos;

                if (i > 0 && tickInfo.expectedHalfTones.size > 0) {
                    const searchEnd = Math.min(measureCursorIndices.length - 1, measurePos + searchWindow);
                    let foundPos = -1;
                    for (let pos = measurePos; pos <= searchEnd; pos++) {
                        const cursorIndex = measureCursorIndices[pos];
                        const notes = this.osmdCursorIdxNoteMap.get(cursorIndex) ?? [];
                        const hasMatch = notes.some(n => {
                            const halfTone = n.Pitch?.getHalfTone();
                            return halfTone != null && tickInfo.expectedHalfTones.has(halfTone);
                        });
                        if (hasMatch) {
                            foundPos = pos;
                            break;
                        }
                    }

                    if (foundPos !== -1) {
                        chosenPos = foundPos;
                    } else if (tickInfos.length > 1) {
                        const ratioPos = Math.round((i / (tickInfos.length - 1)) * (measureCursorIndices.length - 1));
                        chosenPos = Math.max(measurePos, ratioPos);
                    }
                }

                if (i > 0) {
                    const clampedPos = Math.min(chosenPos, measurePos + 1);
                    chosenPos = clampedPos;
                }

                const chosenCursorIndex = measureCursorIndices[Math.min(chosenPos, measureCursorIndices.length - 1)];
                link[tickInfo.ticks] = chosenCursorIndex;
                lastAssignedCursorIndex = chosenCursorIndex;
                measurePos = Math.min(chosenPos + 1, measureCursorIndices.length - 1);
            }
        }

        cursor.reset();
        this.cursorIndex = 0;
        return link;
    }


    async hydrateOsmdArray(cursor: Cursor): Promise<{ midiMeasure: number, osmdMeasure: number, osmdIndex: number, index: number, isLast: boolean, isJump: boolean, target: number | null, targetMeasure: number | null, isSkipable: boolean, }[]> {
        let index = 0;
        let midiMeasureIndex = 0;
        const osmdArray: any[] = [];
        const osmdMesureSequence = Array.of(...this.midiBarToOsmdMeasure.values())
        const uiYieldStep = 64;
        const feedbackStep = Math.max(1, Math.floor(this.iteratorSize / 100));
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

            const currentMeasureValue = osmdMesureSequence[midiMeasureIndex];
            const nextMeasureValue = osmdMesureSequence[midiMeasureIndex + 1];
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
        this.osmdMeasureNoteMap.clear();
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
            cursor.next();
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
        this.osmdCursorIdxNoteMap.clear();
        const totalSteps = Math.max(1, this.iteratorSize);
        const feedbackStep = Math.max(1, Math.floor(totalSteps / 100));
        cursor.reset();
        let cursorIndex = 0;
        this.osmdCursorIdxToMeasureMap.clear();
        while (!cursor.iterator.EndReached) {
            const notesUnderCursor = cursor.NotesUnderCursor();
            const currentMeasureIndex = cursor.iterator.CurrentMeasure.measureListIndex;
            const bucket2 = this.osmdCursorIdxNoteMap.get(cursorIndex);
            if (bucket2) {
                bucket2.push(...notesUnderCursor);
            } else {
                this.osmdCursorIdxNoteMap.set(cursorIndex, notesUnderCursor);
            }
            this.osmdCursorIdxToMeasureMap.set(cursorIndex, currentMeasureIndex);
            cursorIndex++;
            cursor.next();
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
        const totalNotes = Math.max(1, midi.tracks.reduce((sum, track) => sum + track.notes.length, 0));
        const feedbackStep = Math.max(1, Math.floor(totalNotes / 100));
        let processedNotes = 0;

        // group midi notes by bar
        for (const track of midi.tracks) {
            for (const note of track.notes) {
                const bar = Math.trunc(note.bars);
                const bucket = midiBarNoteMap.get(bar);
                if (bucket) {
                    bucket.push(note);
                } else {
                    midiBarNoteMap.set(bar, [note]);
                }

                processedNotes++;
                if (processedNotes % feedbackStep === 0 || processedNotes === totalNotes) {
                    this.feedback(feedbackMessage, (processedNotes / totalNotes) * 100);
                }
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
        const uiYieldStep = 2;
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
        const uiYieldStep = 1;
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
        this.osmdMeasureCount = osmdMeasureIndices.length;
        const repetitionInstructions = this.repetitionInstructions;


        const measureIndexToPos = new Map<number, number>();
        osmdMeasureIndices.forEach((measureIndex, index) => {
            measureIndexToPos.set(measureIndex, index);
        });

        const endingBeginsByMeasure = new Map<number, RepetitionInstruction[]>();
        const endingEndsByMeasure = new Map<number, RepetitionInstruction[]>();
        const endingEnds: RepetitionInstruction[] = [];
        const backJumpByMeasure = new Map<number, RepetitionInstruction>();
        const daCapoByMeasure = new Map<number, RepetitionInstruction>();
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

            if (instr.type === RepetitionInstructionEnum.DaCapo) {
                if (!daCapoByMeasure.has(instr.measureIndex)) {
                    daCapoByMeasure.set(instr.measureIndex, instr);
                }
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
        const uiYieldStep = 4;
        const feedbackStep = Math.max(1, Math.floor(maxSteps / 100));
        const defaultRepeatStartMeasure = osmdMeasureIndices[0] ?? 0;

        this.passCount = 1;
        let activeRepeatAnchorMeasureIndex: number | null = null;
        let activeRepeatMaxEndingNumber: number | null = null;
        let hasExecutedDaCapo = false;

        while (pos < osmdMeasureIndices.length && steps < maxSteps) {
            steps++;
            if (steps % feedbackStep === 0 || steps === maxSteps) {
                this.feedback(feedbackMessage, (steps / maxSteps) * 100);
            }
            if (steps % uiYieldStep === 0) {
                await this.yieldToUi();
            }
            const currentMeasureIndex = osmdMeasureIndices[pos];
            const suppressVoltaSkipAfterAnchor =
                this.passCount > 1 &&
                activeRepeatAnchorMeasureIndex != null &&
                currentMeasureIndex > activeRepeatAnchorMeasureIndex;

            const endingBeginsAtMeasure = endingBeginsByMeasure.get(currentMeasureIndex) ?? [];

            const currentVoltaStart = endingBeginsAtMeasure
                ?.find(instr => {
                    if (suppressVoltaSkipAfterAnchor) {
                        return false;
                    }
                    const endingIndices = instr.endingIndices;
                    if (!endingIndices || endingIndices.length === 0) {
                        return false;
                    }
                    return !endingIndices.includes(this.passCount);
                });

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

            const daCapo = daCapoByMeasure.get(currentMeasureIndex);
            if (daCapo && !hasExecutedDaCapo) {
                const daCapoTargetMeasure = defaultRepeatStartMeasure;
                const daCapoTargetPos = measureIndexToPos.get(daCapoTargetMeasure) ?? 0;

                hasExecutedDaCapo = true;
                this.passCount = 1;
                activeRepeatAnchorMeasureIndex = null;
                activeRepeatMaxEndingNumber = null;
                pos = daCapoTargetPos;
                continue;
            }

            if (backJump) {
                const startLineTarget = previousStartLineByMeasure.get(currentMeasureIndex);
                const targetMeasure = startLineTarget ?? defaultRepeatStartMeasure;

                const anchorMeasureIndex = backJump.measureIndex;
                if (
                    activeRepeatAnchorMeasureIndex != null &&
                    activeRepeatAnchorMeasureIndex !== anchorMeasureIndex
                ) {
                    this.passCount = 1;
                }
                const maxEndingNumber = Math.max(2, maxEndingNumberByAnchor.get(anchorMeasureIndex) ?? 2);

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

    // private getRepeatAnchorForMeasure(measureIndex: number): number | null {
    //     const anchor = this.repetitionInstructions
    //         .filter(
    //             instr =>
    //                 instr.type === RepetitionInstructionEnum.BackJumpLine &&
    //                 instr.alignment === AlignmentType.End &&
    //                 instr.measureIndex <= measureIndex
    //         )
    //         .sort((a, b) => b.measureIndex - a.measureIndex)[0];

    //     return anchor ? anchor.measureIndex : null;
    // }

    // private getMaxEndingNumberForAnchor(anchorMeasureIndex: number): number {
    //     const anchoredEndings = this.repetitionInstructions
    //         .filter(instr => instr.type === RepetitionInstructionEnum.Ending)
    //         .filter(instr => this.getRepeatAnchorForMeasure(instr.measureIndex) === anchorMeasureIndex);

    //     if (anchoredEndings.length === 0) {
    //         return 2;
    //     }

    //     return Math.max(
    //         ...anchoredEndings.flatMap(e => e.endingIndices || [1])
    //     );
    // }
}
