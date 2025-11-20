import { type ElementRef, Injectable, signal, effect } from '@angular/core';
import * as Tone from "tone";
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import { BehaviorSubject } from 'rxjs';
import type { lateNote, PlayConfiguration } from '../model/model';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { reducedFraction } from '../model/reduced-fraction';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import { Synthetizer } from "spessasynth_lib"
import { Piano } from '@tonejs/piano'
import { getStaveDurationTick } from './midi-maths';
import { ScoreApiInfo } from '../../core/api';
import { AlignmentType, Cursor, MusicPartManagerIterator, OpenSheetMusicDisplay, Note as OSMDNote, RepetitionInstruction, RepetitionInstructionEnum, SourceMeasure } from 'opensheetmusicdisplay';


const GOOD_RANGE = 0.2
const TIME_COUNTER_TIMESTEP = 200

@Injectable({
  providedIn: 'root'
})
export class PlayerService {

  osmd: OpenSheetMusicDisplay | null = null;

  osmdCursor: Cursor = null as unknown as Cursor;

  setOsmd(osmd: OpenSheetMusicDisplay) {
    this.osmd = osmd;
    this.osmdCursor = this.osmd.cursor;
    this.osmdCursor.CursorOptions.color = "#B0F2B4";
    this.osmdCursor.CursorOptions.alpha = 0.6;
    this.hydrateRepetitionInstructions();
    this.osmdCursor.reset();
  }

  hydrateRepetitionInstructions() {
    // iterate throught this.osmdCursor.iterator.CurrentMeasure 
    while (!this.osmdCursor.iterator.EndReached) {
      const m = this.osmdCursor.iterator.CurrentMeasure;
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
      this.osmdCursor.iterator.moveToNext();
    }
    // Get all relevant repetition instructions
    Array.from(this.repetitionInstructions).forEach(instr => {
      console.log(instr);
    });
  }


  private keyboardElement!: ElementRef;
  public measure = signal<number>(0);
  public message = signal<string>("");
  public elapsedTime = new BehaviorSubject<number>(0);

  duration = 0;


  isWaiting = false;
  playConfiguration!: PlayConfiguration;
  private midiSetupTimeout?: number;
  synth: Tone.Synth<Tone.SynthOptions> | undefined;
  spessasynth?: Synthetizer;

  midiPressedNotes: Set<number> = new Set<number>();
  lateNotes: Map<number, lateNote[]> = new Map<number, lateNote[]>();
  piano: any;
  lastMidiEventTime = 0;
  currentMeasure = -1;
  private timeCounterInterval?: number;

  // Keyboard preferences loaded from localStorage
  leftmostKey: number = 21;  // Default A0
  rightmostKey: number = 108; // Default C8

  // Cached time factor to avoid repeated calculations
  private _timeFactorCache?: number;
  private _lastTempoFactor?: number;
  private _lastDelayFactor?: number;

  // DOM elements cache for keyboard keys (by MIDI note number)
  private _keyboardElementsCache = new Map<number, HTMLElement[]>();

  // Track active notes with classes to avoid expensive DOM queries
  private _activeKeyboardElements = new Set<HTMLElement>();

  private passCount = 1;

  constructor(private midiService: MidiServiceService) {
    midiService.setupMidiDeviceListeners();
    this.loadKeyboardPreferences();
    this.initSoundFont();
    this.synth = new Tone.Synth().toDestination();
    this.initPiano();
    this.reset = this.reset.bind(this);

    // Effet pour traiter les événements MIDI via signal
    effect(() => {
      const midiEvent = this.midiService.midiEvent();
      if (midiEvent) {
        this.processMidiEvent(midiEvent);
      }
    });
  }

  preconfigurePlayConfiguration(scoreApiInfo: ScoreApiInfo, playConfiguration: PlayConfiguration, midiAll: Midi.Midi): PlayConfiguration {
    let study_tracks = [0]
    if (scoreApiInfo?.study_tracks && scoreApiInfo?.study_tracks?.length > 0) {
      study_tracks = scoreApiInfo.study_tracks;
    } else if (midiAll.tracks.length == 1) {
      study_tracks = [0];
    } else if (midiAll.tracks.length == 2) {
      study_tracks = [0, 1];
    }
    const midiAsDefaultTempo = midiAll.header.tempos.every((t) => { t.bpm === 120; return true });
    if (midiAsDefaultTempo && scoreApiInfo?.tempo) {
      playConfiguration.tempoFactor = (scoreApiInfo?.tempo || 120) / 120;
    }

    const midiSplit = this.splitMidi(midiAll.toJSON(), study_tracks);
    playConfiguration.accompaniment = midiSplit.other;
    playConfiguration.midi = midiSplit.study;

    playConfiguration.maxStaveCount = Math.ceil(Math.max(...midiSplit.study.tracks.map(track =>
      track.notes.length > 0 ? track.notes[track.notes.length - 1].bars : 0
    )));
    playConfiguration.scoreRange[0] = 1;
    playConfiguration.scoreRange[1] = playConfiguration.maxStaveCount + 1;
    this.playConfiguration = playConfiguration;
    this.reset(playConfiguration);
    return playConfiguration;
  }


  splitMidi(json: Midi.MidiJSON, studies: number[]): { study: Midi.Midi, other: Midi.Midi } {

    // Remove tracks with no notes
    json.tracks = json.tracks.filter(track => track.notes.length > 0);

    json.tracks.forEach((track, idx) => {
      console.log(`Track ${idx}: ${track.name}, instrument: ${track.instrument.name}, notes: ${track.notes.length}`);
    });

    // If studies.length === 1, include all tracks with the same instrument name
    if (studies.length === 1) {
      const studyTrackInstrument = json.tracks[studies[0]].instrument.name;
      studies = json.tracks
        .map((track, idx) => ({ idx, instrumentName: track.instrument.name }))
        .filter(item => item.instrumentName === studyTrackInstrument)
        .map(item => item.idx);
      console.log(`Extended studies to all tracks with instrument "${studyTrackInstrument}":`, studies);
    }

    //studies = [0,1]
    const midiAll = new Midi.Midi();
    midiAll.fromJSON(json)
    this.duration = midiAll.duration;
    if (midiAll.header.timeSignatures.length === 0) {
      midiAll.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
    }

    const midiStudied = midiAll.clone();
    const midiOther = midiAll.clone();

    const midiStudiedTracks = midiAll.tracks.filter((track, idx) => {
      return studies?.indexOf(idx) !== -1;
    });
    midiStudied.tracks = midiStudiedTracks;

    const midiOtherTracks = midiAll.tracks.filter((track, idx) => {
      return studies?.indexOf(idx) === -1;
    });
    midiOther.tracks = midiOtherTracks
    return { study: midiStudied, other: midiOther };
  }

  initPiano() {
    this.piano = new Piano({
      velocities: 1
    }).toDestination();
    this.piano.load()
  }

  private setupTimeCounter() {
    // Nettoyer l'ancien interval s'il existe
    if (this.timeCounterInterval) {
      clearInterval(this.timeCounterInterval);
    }

    // Initialiser le compteur de temps
    this.elapsedTime.next(0);

    // Créer un interval qui vérifie toutes les TIME_COUNTER_TIMESTEP ms l'état du transport
    this.timeCounterInterval = window.setInterval(() => {
      if (Tone.getTransport().state === "started" && (this.playConfiguration.waitForLeftHand || this.playConfiguration.waitForRightHand)) {
        const currentTime = this.elapsedTime.value + TIME_COUNTER_TIMESTEP;
        this.elapsedTime.next(currentTime);
      }
    }, TIME_COUNTER_TIMESTEP);
  }

  setup() {
    this.setupTimeCounter();
    // L'effet MIDI est maintenant géré dans le constructeur via le signal
  }



  async initSoundFont() {
    if (this.spessasynth != null) {
      return; // already initialized
    }
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/assets/soundfonts/worklet_processor.min.js")
    fetch("assets/soundfonts/GeneralUserGS.sf3").then(async response => {
      const sfont = await response.arrayBuffer();
      this.spessasynth = new Synthetizer(ctx.destination, sfont, false);
      this.spessasynth.resetControllers();
    });
  }


  setKeyboardElement(nativeElementRef: ElementRef) {
    this.keyboardElement = nativeElementRef;
    this._keyboardElementsCache.clear(); // Clear cache when keyboard element changes
    this._activeKeyboardElements.clear(); // Clear active elements tracking
    this.setup();
  }

  pause() {
    this.spessasynth?.stopAll();
    Tone.getTransport().pause();
    this.removeAllNotesFromKeyboard()
  }

  async reset(playConfiguration: PlayConfiguration) {
    this.passCount = 1;
    this.playConfiguration = playConfiguration;
    this.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    Tone.getTransport().cancel();
    Tone.getDraw().dispose();
    Tone.getDraw().cancel();
    this.resetLateNotes();
    this.lastMidiEventTime = -1;
    // Reset repetition tracking
    this.repetitionPasses.clear();
    this.repetitionStartMeasure = null;
    this.repetitionInstructions.clear();
    if (this.osmdCursor !== null) {
      this.osmdCursor.reset();
      for (let i = 0; i < this.playConfiguration.currentStave - 1; i++) {
        this.osmdCursor.nextMeasure();
      }
    }
  }

  async play(playConfigurations: PlayConfiguration) {
    if (this.lastMidiEventTime === -1) {
      this.osmdCursor.previous();
    }
    //this.lastMidiEventTime = -1;
    this.resetLateNotes();
    const startOffset = this.calculateStartTime();
    const endCut = this.calculateEndTime();
    this.playConfiguration = playConfigurations;
    this.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes
    await Tone.start();
    this.scheduleRightHand(this.playConfiguration.midi!.tracks[0], startOffset, endCut);
    if (this.playConfiguration.midi!.tracks.length > 1) {
      this.scheduleLeftHand(this.playConfiguration.midi!.tracks[1], startOffset, endCut);
    }
    this.scheduleAccompanimentTracks(this.playConfiguration.accompaniment!, startOffset, endCut);
    this.scheduleEnd(endCut - startOffset);
    //Tone.getContext().lookAhead = 0
    Tone.getTransport().start();
  }

  scheduleLeftHand(midi: Midi.Track, startTime: number, endCut: number) {
    for (const note of midi.notes) {
      if (this.isInPlayableRange(note, startTime, endCut)) {
        this.scheduleNote('lh', note, startTime);
      }


    }
  }
  scheduleRightHand(midi: Midi.Track, startTime: number, endCut: number) {
    for (const note of midi.notes) {
      if (this.isInPlayableRange(note, startTime, endCut)) {
        this.scheduleNote('rh', note, startTime);
      }
    }
  }

  private scheduleAccompanimentTracks(midiOther: Midi.Midi, startTime: number, endCut: number) {
    for (const track of midiOther.tracks) {
      this.spessasynth?.programChange(track.channel, track.instrument.number);
      this.scheduleAccompanimentTrack(track.channel, track, startTime, endCut);
    }
  }

  private isInPlayableRange(note: Note, startTime: number, endCut: number) {
    const noteTime = note.time * this.getTimeFactor();
    return noteTime >= startTime && noteTime < endCut;
  }

  private scheduleAccompanimentTrack(channel: number, track: Midi.Track, startTime: number, endCut: number) {
    for (const note of track.notes) {
      if (this.isInPlayableRange(note, startTime, endCut)) {
        this.scheduleAccompanimentTrackNotes(channel, note, startTime);
      }
    }
  }

  private scheduleAccompanimentTrackNotes(channel: number, note: Note, startOffset: number) {
    if (note.time < startOffset) return;
    if (note.midi === 0) return; // skip rest notes
    const noteStart = (note.time * this.getTimeFactor()) - startOffset;
    // note on
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOn(channel, note.midi, Math.round(note.velocity * 127));
    }, noteStart);
    // note off
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOff(channel, note.midi);
    }, noteStart + (note.duration * this.getTimeFactor()));
  }

  private gotoMeasure(measureNumber: number, actualMeasureNumber: number) {
    let delta = measureNumber - actualMeasureNumber;
    if (delta > 0) {
      this.osmdCursor.nextMeasure();
      this.osmdCursor.previous();
      delta--;
    }
    if (delta < 0) {
      this.osmdCursor.previousMeasure();
      this.osmdCursor.nextMeasure();
    }

  }

  repetitionInstructions = new Set<RepetitionInstruction>();

  // Track which repetitions have been taken (measure number -> pass count)
  private repetitionPasses = new Map<number, number>();

  // Track if we're in a repetition section
  private repetitionStartMeasure: number | null = null;

  // export enum RepetitionInstructionEnum {
  //     0 StartLine,
  //     1 ForwardJump,
  //     2 BackJumpLine,
  //     3 Ending,
  //     DaCapo,
  //     DalSegno,
  //     Fine,
  //     ToCoda,
  //     DalSegnoAlFine,
  //     DaCapoAlFine,
  //     DalSegnoAlCoda,
  //     DaCapoAlCoda,
  //     Coda,
  //     Segno,
  //     None,
  // }

  private backToMeasure(measureIndex: number) {
    console.log("BACK TO MEASURE", measureIndex);
    while (this.osmdCursor.iterator.CurrentMeasure.MeasureNumber > measureIndex + 1) {
      this.osmdCursor.previousMeasure();
    }
    setTimeout(() => {
      this.osmdCursor.previous();
    }, 0);
  }



  private nextToMeasure(measureIndex: number) {
    console.log("FORWARD TO MEASURE", measureIndex);
    while (this.osmdCursor.iterator.CurrentMeasure.MeasureNumber < measureIndex + 1) {
      this.osmdCursor.nextMeasure();
    }
    setTimeout(() => {
      this.osmdCursor.previous();
    }, 0);
  }


  private maybeMoveToMeasure(iterator: MusicPartManagerIterator) {
    const currentMeasureNumber = iterator.CurrentMeasure.MeasureNumber;
    console.log(this.passCount, currentMeasureNumber)
    //console.log(this.passCount, currentMeasureNumber)




    if (this.isLastNoteOfMeasure(iterator)) {
      console.log("last note of measure", this.passCount, currentMeasureNumber)
      const currentJumbBack = Array.from(this.repetitionInstructions).filter(
        instr =>
          instr.measureIndex === currentMeasureNumber - 1
          && instr.type === RepetitionInstructionEnum.BackJumpLine
          && instr.alignment === AlignmentType.End
      );
      console.log(currentJumbBack)

      if (currentJumbBack[this.passCount - 1]) {
        console.log(currentJumbBack)
        console.log("currentJumbBack!!!!!!!!!!!" + this.passCount, currentMeasureNumber)
        // Find the start line
        const startLine = Array.from(this.repetitionInstructions).filter(
          instr =>
            instr.type === RepetitionInstructionEnum.StartLine
            && instr.alignment === AlignmentType.Begin
            && instr.measureIndex === currentMeasureNumber
        ).at(this.passCount - 1);
        const targetMeasure = startLine ? startLine.measureIndex : 0;
        this.backToMeasure(targetMeasure);
        this.passCount++;
        return true;
      }
    }


    if (this.passCount > 1 && this.isFirstNoteOfMeasure(iterator)) {
      console.log("first note of measure", this.passCount, currentMeasureNumber)
      // Get all relevant repetition instructions
      const currentJumpNext = Array.from(this.repetitionInstructions).find(
        instr => instr.type === RepetitionInstructionEnum.Ending
          && instr.measureIndex === currentMeasureNumber - 1
          && instr.alignment === AlignmentType.Begin
        //&& !(instr.endingIndices?.includes(this.passCount))
      );

      if (currentJumpNext) {


        // Find the start line
        const startLine = Array.from(this.repetitionInstructions).filter(
          instr =>
            instr.type === RepetitionInstructionEnum.Ending
            && instr.endingIndices?.includes(this.passCount)
            && instr.alignment === AlignmentType.End
        ).pop()
        const targetMeasure = startLine ? startLine.measureIndex : 0;
        console.log(currentJumpNext)
        console.log("currentJumpNext!!!!!!!!!!!" + this.passCount, currentMeasureNumber)
        this.nextToMeasure(targetMeasure);

        return true;
      }
    }



    return false;
  }

  //   // // Handle case: we're at the end of an ending
  //   // if (currentEnding) {
  //   //   const endingNumbers = currentEnding.endingIndices || [1];
  //   //   const isLastEnding = !allEndings.some(e =>
  //   //     (e.endingIndices || [1]).some(num => num > Math.max(...endingNumbers))
  //   //   );

  //   //   //console.log(`At ending ${endingNumbers.join(',')}, pass count: ${passCount}, has BackJump: ${!!backJump}, isLastEnding: ${isLastEnding}`);

  //   //   // If this ending has a backJump and it's not the last ending
  //   //   if (backJump && !isLastEnding) {
  //   //     // Increment pass count for next iteration
  //   //     this.repetitionPasses.set(currentEnding.measureIndex, passCount + 1);


  //   //     console.log(`Ending ${endingNumbers.join(',')} completed, jumping back to measure ${targetMeasure} (next pass: ${passCount + 1})`);


  //   //     // If it's the last ending, just continue normally
  //   //     if (isLastEnding) {
  //   //       console.log(`Playing last ending ${endingNumbers.join(',')}, continuing forward`);
  //   //       // Continue normally
  //   //     }
  //   //   } else if (backJump) {
  //   //     // BackJump without ending (simple repeat without volta brackets)
  //   //     passCount = this.repetitionPasses.get(currentMeasureNumber) || 0;

  //   //     if (passCount < 1) {
  //   //       this.repetitionPasses.set(currentMeasureNumber, passCount + 1);

  //   //       const startLine = Array.from(this.repetitionInstructions).find(
  //   //         instr => instr.type === RepetitionInstructionEnum.StartLine &&
  //   //           instr.measureIndex < currentMeasureNumber
  //   //       );

  //   //       const targetMeasure = startLine ? startLine.measureIndex : 0;
  //   //       // console.log(`Simple repeat: jumping back from measure ${currentMeasureNumber} to ${targetMeasure} (pass ${passCount + 1})`);
  //   //       this.backToMeasure(targetMeasure);
  //   //       this.repetitionStartMeasure = targetMeasure;
  //   //       return;
  //   //     } else {
  //   //       console.log(`Already repeated measure ${currentMeasureNumber}, continuing forward`);
  //   //       this.repetitionStartMeasure = null;
  //   //     }
  //   //   }
  //   // }

  //   // if (this.isFirstNoteOfMeasure(iterator)) {
  //   //   // Check for start of repetition section
  //   //   const startLine = Array.from(this.repetitionInstructions).find(
  //   //     instr => instr.type === RepetitionInstructionEnum.StartLine &&
  //   //       instr.measureIndex === currentMeasureNumber
  //   //   );

  //   //   if (startLine) {
  //   //     this.repetitionStartMeasure = currentMeasureNumber;
  //   //     console.log(`Entering repetition section at measure ${currentMeasureNumber}`);
  //   //   }
  //   // }
  // }

  private cursorMayBeAdvance(note: Note) {

    if (note.ticks > this.lastMidiEventTime) {

      this.lastMidiEventTime = note.ticks;

      this.currentMeasure = Math.floor(note.bars);

      this.osmdCursor.next();


      setTimeout(() => {
        this.maybeMoveToMeasure(this.osmdCursor.iterator);
      }, 0);

      let safety = 0;
      while (safety < 100 && this.osmdCursor.NotesUnderCursor().every(n => this.isSkipable(n))) {
        this.maybeMoveToMeasure(this.osmdCursor.iterator);
        this.osmdCursor.next();
        safety++;
      }

      if (false) {
        // setTimeout(() => {
        //   this.osmdCursor.previous();
        // }, 0);
      }





      if (!this.isCursorOk(note)) {
        this.osmdCursor.CursorOptions.color = '#FFB3BA';
        this.osmdCursor.CursorOptions.alpha = 0.3;
      } else {
        this.osmdCursor.CursorOptions.color = "#B0F2B4";
        this.osmdCursor.CursorOptions.alpha = 0.6;
      }
    }
  }


  isLastNoteOfMeasure(iterator: MusicPartManagerIterator) {
    const currentMeasure = this.osmdCursor.iterator.CurrentMeasure.MeasureNumber;
    this.osmdCursor.next();
    const nextMeasure = this.osmdCursor.iterator.CurrentMeasure.MeasureNumber;
    this.osmdCursor.previous();
    //console.log("CURRENT", currentMeasure, "NEXT", nextMeasure);
    return currentMeasure < nextMeasure;
  }

  isFirstNoteOfMeasure(iterator: MusicPartManagerIterator) {
    const currentMeasure = this.osmdCursor.iterator.CurrentMeasure.MeasureNumber;
    this.osmdCursor.previous();
    const previousMeasure = this.osmdCursor.iterator.CurrentMeasure.MeasureNumber;
    //console.log("CURRENT", currentMeasure, "NEXT", previousMeasure);
    this.osmdCursor.next();
    return currentMeasure > previousMeasure;
  }


  isCursorOk(note: Note): boolean {
    return this.osmdCursor.NotesUnderCursor().map(n => n.Pitch?.getHalfTone()).some(n => n === note.midi - 12);
  }

  isSkipable(n: OSMDNote): unknown {
    return n.isRest()
      || (n.NoteTie && n.NoteTie?.Notes.at(0)?.NoteToGraphicalNoteObjectId !== n.NoteToGraphicalNoteObjectId)
      || n.IsCueNote
  }



  private scheduleNote(hand: string, note: Note, startTime: number) {
    const noteTimeStart = (note.time * this.getTimeFactor()) - startTime;
    const noteTimeEnd = ((note.time * this.getTimeFactor()) - startTime + (note.duration * this.getTimeFactor()));
    // schedule watch, score advance and keyboard light on
    Tone.getTransport().schedule((time: number) => {
      Tone.getDraw().schedule(() => {

        this.cursorMayBeAdvance(note);

        this.lightNoteOnKeyboard(hand, note)
        if (this.lateNotes.size > 0) {
          this.isWaiting = true;
          Tone.getTransport().pause();
        }
        if (this.isHandOk(hand, note.midi)) {
          this.pushLateNote(note);
        }
        this.setCurrentTick(note.bars);
      }, time);
    }, noteTimeStart);

    Tone.getTransport().schedule((time: number) => {

      this.piano.keyDown({
        time: time,
        velocity: note.velocity,
        note: note.name,
        midi: note.midi
      });
    }, noteTimeStart);

    // schedule keyboard light off
    Tone.getTransport().schedule((time: number) => {

      this.piano.keyUp({
        time: time + note.duration,
        velocity: note.velocity,
        note: note.name,
        midi: note.midi
      });

      Tone.getDraw().schedule(() => {
        if (!this.isHandOk(hand, note.midi)) {
          // Vérifier d'abord si la note est en attente avant la recherche DOM
          const isNoteAwaited = Array.from(this.lateNotes.values())
            .some(lateNotesList =>
              lateNotesList.some(lateNote => lateNote.note.midi === note.midi)
            );

          if (!isNoteAwaited) {
            this.removeMidiNoteFromKeyboard(note.midi);
          } else {
            this.lightNoteOnKeyboard('late', note);
          }
        }
      }, time);
    }, noteTimeEnd);

    Tone.getTransport().schedule((time: number) => {
      Tone.getDraw().schedule(() => {

        if (this.lateNotes.size > 1) {
          this.isWaiting = true;
          Tone.getTransport().pause();
        }
      }, time);
    }, Math.max(noteTimeStart - GOOD_RANGE, 0));
  }


  private getKeyboardElements(midiNote: number): HTMLElement[] {
    if (!this._keyboardElementsCache.has(midiNote)) {
      const elements = Array.from(
        this.keyboardElement.nativeElement.querySelectorAll(`.key${midiNote}`)
      ) as HTMLElement[];
      this._keyboardElementsCache.set(midiNote, elements);
    }
    return this._keyboardElementsCache.get(midiNote)!;
  }

  private lightNoteOnKeyboard(hand: string, note: Note) {
    const velocityUI = Math.min(
      Math.max(Math.round(note.velocity * 10), 1),
      10
    );

    const keys = this.getKeyboardElements(note.midi);

    const class1 = `note-on-${hand}`;
    const class2 = `note-on-${hand}-velocity-${velocityUI}`;

    for (const el of keys) {
      el.classList.add(class1, class2);
      this._activeKeyboardElements.add(el); // Track active element
    }
  }


  private scheduleEnd(endTime: number) {
    Tone.getTransport().schedule(() => {
      this.spessasynth?.stopAll();
      this.message.set("END");
      this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
      this.reset(this.playConfiguration);
      if (this.playConfiguration.isLoop) {
        this.play(this.playConfiguration);
      }
      this.lastMidiEventTime = -1;
    }, endTime + 3);
  }


  private setCurrentTick(bar: number) {
    const truncatedBar = Math.trunc(bar);
    if (truncatedBar !== this.measure()) {
      this.measure.set(truncatedBar);
    }
  }

  private isHandOk(hand: string, midiPitch: number) {
    return (((hand === 'rh' && this.playConfiguration.waitForRightHand)
      || (hand === 'lh' && this.playConfiguration.waitForLeftHand))
      && (midiPitch >= this.leftmostKey && midiPitch <= this.rightmostKey)
    );
  }

  getTimeFactor() {
    // Check if cache is invalid
    if (this._timeFactorCache === undefined
      || this._lastTempoFactor !== this.playConfiguration.tempoFactor
      || this._lastDelayFactor !== this.playConfiguration.delayFactor) {
      // Recalculate and cache
      this._timeFactorCache = 1 / (this.playConfiguration.tempoFactor / this.playConfiguration.delayFactor);
      this._lastTempoFactor = this.playConfiguration.tempoFactor;
      this._lastDelayFactor = this.playConfiguration.delayFactor;
    }
    return this._timeFactorCache;
  }

  private invalidateTimeFactorCache() {
    this._timeFactorCache = undefined;
    this._lastTempoFactor = undefined;
    this._lastDelayFactor = undefined;
  }

  calculateStartTime() {
    const startTime = (this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[0] - 1,
      this.playConfiguration.midi!.header
    ) * this.getTimeFactor());
    return startTime;
  }


  calculateEndTime() {
    if (this.playConfiguration.scoreRange[1] === this.playConfiguration.maxStaveCount + 1
      && this.playConfiguration.scoreRange[0] === 1) {
      return this.duration * this.getTimeFactor();
    }
    return (this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[1] + 1,
      this.playConfiguration.midi!.header
    ) * this.getTimeFactor());
  }


  calculateStartTimeInMsForMeasure(start: number, midiHeader: Midi.Header): number {
    let timeSig: TimeSignatureEvent | undefined = midiHeader.timeSignatures[0];
    let elapsedTicks = 0;
    for (let i = 0; i < start; i++) {
      timeSig = midiHeader.timeSignatures.filter((t) => t.ticks <= elapsedTicks).at(-1);
      elapsedTicks += getStaveDurationTick(reducedFraction(timeSig?.timeSignature[0] || 4, timeSig?.timeSignature[1] || 4), midiHeader.ppq);
    }
    return midiHeader.ticksToSeconds(elapsedTicks);
  }


  resetLateNotes() {
    this.lateNotes = new Map<number, lateNote[]>();
    this.removeAllNotesFromKeyboard();
    this.midiPressedNotes = new Set<number>();
  }


  pushLateNote(note: Note) {
    const lateNoteEntry: lateNote = { note: note, pressed: false };

    // Add to both structures for backward compatibility and fast lookup
    if (!this.lateNotes.has(note.ticks)) {
      this.lateNotes.set(note.ticks, []);
    }
    this.lateNotes.get(note.ticks)!.push(lateNoteEntry);
  }

  private integrateMidiEventInLastNote(midiEvent: MidiStateEvent): number {
    let success = -1;
    const entries = Array.from(this.lateNotes.entries());

    for (const [key, notes] of entries) {
      for (let idx = notes.length - 1; idx >= 0; idx--) {
        const ln = notes[idx];
        if (midiEvent.note === ln.note.midi) {
          notes.splice(idx, 1);
          this.removeMidiNoteFromKeyboard(ln.note.midi);
          if (idx === 0) {
            success = 1;
          } else {
            success = 0;
          }
        }
      }
      if (notes.length === 0) {
        this.lateNotes.delete(key);
        success = 1;
      }
    }
    return success;
  }


  private async processMidiEvent(midiEvent: MidiStateEvent) {
    if (!this.playConfiguration
      || (this.playConfiguration.waitForLeftHand === false
        && this.playConfiguration.waitForRightHand === false)
    ) {
      return
    }
    if (midiEvent.type === 'down' as MidiStateEvent['type']) {

      const hit = this.integrateMidiEventInLastNote(midiEvent);
      if (this.lateNotes.size === 0 && this.isWaiting) {
        await Tone.start();
        Tone.getTransport().start();
        this.isWaiting = false;
      } else {
        this.lateNotes.forEach((lateNotesList) => {
          lateNotesList.forEach((lateNote) => {
            this.lightNoteOnKeyboard('rh', lateNote.note); // todo assign hand properly
          });
        });
      }
      if (hit < 1) {
        this.message.set("BAD");
        setTimeout(() => {
          this.message.set("");
        }, 10);
      }
    }
  }

  private clearClassesFromElement(el: HTMLElement, prefix: string) {
    const classList = el.classList;
    const classesToRemove: string[] = [];
    for (let i = 0; i < classList.length; i++) {
      if (classList[i].startsWith(prefix)) {
        classesToRemove.push(classList[i]);
      }
    }
    classesToRemove.forEach(className => classList.remove(className));
  }

  private removeMidiNoteFromKeyboard(midiNote: number) {
    const keys = this.getKeyboardElements(midiNote);
    for (const key of keys) {
      this.clearClassesFromElement(key, "note-on");
      this._activeKeyboardElements.delete(key); // Remove from active set
    }
  }

  private removeAllNotesFromKeyboard() {
    // Use the tracked set instead of expensive DOM query
    for (const el of this._activeKeyboardElements) {
      this.clearClassesFromElement(el, "note-on");
    }
    this._activeKeyboardElements.clear();
  }

  /**
   * Charge les préférences du clavier depuis localStorage
   */
  private loadKeyboardPreferences() {
    try {
      const preferences = localStorage.getItem('preferences');
      if (preferences) {
        const parsedPreferences = JSON.parse(preferences);
        this.leftmostKey = parsedPreferences.leftmostKey || 21;
        this.rightmostKey = parsedPreferences.rightmostKey || 108;
        console.log(`Loaded keyboard preferences: leftmost=${this.leftmostKey}, rightmost=${this.rightmostKey}`);
      }
    } catch (error) {
      console.error('Error loading keyboard preferences:', error);
      // Keep default values in case of error
      this.leftmostKey = 21;
      this.rightmostKey = 108;
    }
  }

  /**
   * Recharge les préférences du clavier depuis localStorage
   * Méthode publique pour permettre le rechargement à chaud
   */
  reloadKeyboardPreferences() {
    this.loadKeyboardPreferences();
  }

  /**
   * Nettoie les ressources du service, notamment l'interval du compteur de temps
   */
  cleanup() {
    if (this.timeCounterInterval) {
      clearInterval(this.timeCounterInterval);
      this.timeCounterInterval = undefined;
    }
    if (this.midiSetupTimeout) {
      clearTimeout(this.midiSetupTimeout);
      this.midiSetupTimeout = undefined;
    }
    // Clear DOM caches to prevent memory leaks
    this._keyboardElementsCache.clear();
    this._activeKeyboardElements.clear();
  }
}



