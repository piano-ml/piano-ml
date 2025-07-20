import { type ElementRef, Injectable } from '@angular/core';
import { Accidental, Annotation, BarlineType, Beam, Dot,  type RenderContext, Renderer, Stave, StaveConnector, StaveNote, type StemmableNote, type Tickable, TickContext, Voice } from 'vexflow';
import type * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import { BehaviorSubject, ReplaySubject } from 'rxjs';
import type { StaveAndStaveNotesPair } from '../model/model';
import { HandDetectorService } from './hand-detector.service';
import { compareFractions, reducedFraction, type ReducedFraction } from '../model/reduced-fraction';
import { getBar, detectDuration, getStaveDurationTick } from './music-theory';
import { fillWithRest } from './rest-filler';


@Injectable({
  providedIn: 'root'
})
export class EngravingService {

  width = 64596;
  height = 320;
  staveWidth = 360;
  stave_offset_hint = 30;
  tempo!: number;
  timeSignatures: Map<number, ReducedFraction> = new Map();
  maxXPosition = 0;

  ppq!: number;
  staveAndStaveNotesPair: StaveAndStaveNotesPair[] = []
  renderer!: Renderer;
  context!: RenderContext;
  ready: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  subject = new ReplaySubject<boolean>();

  RH = 0;
  LH = 1;

  scoreElementRef!: ElementRef<HTMLDivElement>;
  handDetector!: HandDetectorService;
  previousTimeSignature: ReducedFraction | null = null

  midiObj!: Midi.Midi;
  doStaffSplit = false;
  fingering: number[][][] | undefined;
  scale = 1.2;

  renderScore(nativeElementRef: ElementRef, width: number) {
    if (!this.midiObj) {
      console.error("midi object not loaded in vexflow service")
      return;
    }
    this.scoreElementRef = nativeElementRef.nativeElement;
    if (!this.scoreElementRef) {
      throw new Error('Score element not found');
    }
    this.renderer = new Renderer(this.scoreElementRef as unknown as HTMLDivElement, Renderer.Backends.SVG);
    this.renderer.resize(this.width, this.height);
    this.context = this.renderer.getContext();
    this.context.scale(this.scale, this.scale);
    this.staveAndStaveNotesPair = [];
    this.handDetector = new HandDetectorService(this.midiObj, this.doStaffSplit);
    this.setupVoicePairs(this.midiObj);
    this.drawVoicePairs();
    this.ready.next(true)
  }


  setupMidiScore(midiObj: Midi.Midi, doStaffSplit = false, fingering?: number[][][]) {
    this.doStaffSplit = doStaffSplit
    this.midiObj = midiObj;
    this.initTimeSignatures(this.midiObj);
    this.initScoreValues(this.midiObj);
    this.fingering = fingering;
  }

  initTimeSignatures(midiObj: Midi.Midi) {
    for (const timeSignature of midiObj.header.timeSignatures) {
      const time = timeSignature.timeSignature[0];
      this.timeSignatures.set(timeSignature.ticks, reducedFraction(
        timeSignature.timeSignature[0],
        timeSignature.timeSignature[1]
      ));
    }
  }

  initScoreValues(midiObj: Midi.Midi) {
    if (midiObj.header.tempos.length === 0) {
      midiObj.header.tempos.push({ bpm: 60, ticks: 0 });
    }
    this.tempo = midiObj.header.tempos[0].bpm;
    this.ppq = midiObj.header.ppq;
  }

  getOrMakeVoice(idx: number, timesig: ReducedFraction): StaveAndStaveNotesPair {
    // if we already get it just return
    if (this.staveAndStaveNotesPair[idx]) {
      return this.staveAndStaveNotesPair[idx];
    }
    // build previous unexisting measures
    for (let i = 0; i < idx; i++) {
      if (!this.staveAndStaveNotesPair[idx]) {
        if (!this.staveAndStaveNotesPair[i]) {
          this.getOrMakeVoice(i, timesig);
        }
      }
    }
    const beat_value = timesig.numerator;
    const num_beats = timesig.denominator;
    const w = this.staveWidth;

    const staveTreble = new Stave(this.stave_offset_hint + (w * idx), 20, w);
    const staveBass = new Stave(this.stave_offset_hint + (w * idx), (this.height / 2) - 40, w);
    if (idx === 0 || this.previousTimeSignature == null || compareFractions(this.previousTimeSignature, timesig) !== 0) {
      staveTreble.addClef('treble').addTimeSignature(`${beat_value}/${num_beats}`).setBegBarType(BarlineType.NONE);
      staveBass.addClef('bass').addTimeSignature(`${beat_value}/${num_beats}`).setBegBarType(BarlineType.NONE);
    }
    staveBass.setMeasure(idx);
    staveTreble.setMeasure(idx);

    staveBass.setContext(this.context).draw();
    staveTreble.setContext(this.context).draw();

    const vp = {
      staveNotesTreble: [],
      staveNotesBass: [],
      staveTreble: staveTreble,
      staveBass: staveBass,
      midiNotesTreble: [],
      midiNotesBass: [],
      xPositionsTreble: [],
      xPositionsBass: [],
    } as unknown as StaveAndStaveNotesPair;
    this.staveAndStaveNotesPair.splice(idx, 0, vp);
    this.previousTimeSignature = timesig;
    return vp;
  }

  setupVoicePairs(midiObj: Midi.Midi) {
    const doStaffSplit = this.handDetector.doStaffSplit();

    for (const [trackIndex, track] of midiObj.tracks.entries()) {

      const notesRH: Array<Note[]> = []
      const notesLH: Array<Note[]> = []
      const hands = [notesRH, notesLH]

      // regroup
      const grouped = track.notes.reduce(
        (result: { [key: string]: Note[] }, currentValue: Note) => {
          const key = `${currentValue.ticks}`;
          if (!result[key]) {
            result[key] = [];
          }
          result[key].push(currentValue);
          return result;
        }, {});

      for (const key in grouped) {
        const notesAtTime = grouped[key];
        if (!doStaffSplit) {
          hands[trackIndex].push(notesAtTime)
        } else {
          const lr = this.handDetector.detectHand(notesAtTime)
          if (lr[0].length > 0) {
            hands[0].push(lr[0])
          }
          if (lr[1].length > 0) {
            hands[1].push(lr[1])
          }
        }
      }
      // right hands
      let previousTick = 0;
      let i = 0;
      notesRH.sort((a, b) => a[0].ticks - b[0].ticks)
      notesLH.sort((a, b) => a[0].ticks - b[0].ticks)
      for (const midiNotes of notesRH) {
        const fingers = this.fingering ? [0] : undefined
        previousTick = this.buildHand(midiNotes, previousTick, "treble", (this.fingering?.[0]) ? this.fingering[0][i] : undefined);
        i++;
      }
      i = 0;
      for (const midiNotes of notesLH) {
        previousTick = this.buildHand(midiNotes, previousTick, "bass", (this.fingering?.[1]) ? this.fingering[1][i] : undefined);
        i++;
      }
    }
  }

  buildHand(notes: Note[], _previousTick: number, clef: string, fingers?: number[]) {
    let previousTick = _previousTick
    const tick = notes[0].ticks;

    const timesig = this.getTimeSignature(tick);
    const voicePair = this.getOrMakeVoice(getBar(notes[0]), timesig);
    const stave = clef === "treble" ? voicePair.staveTreble : voicePair.staveBass;
    const staveNotes = clef === "treble" ? voicePair.staveNotesTreble : voicePair.staveNotesBass;
    const note = this.buildStaveNotes(notes, timesig, clef, fingers);

    if (clef === "treble") {
      voicePair.midiNotesTreble.push(notes);
    } else {
      voicePair.midiNotesBass.push(notes);
    }
    staveNotes.push(note);
    previousTick = tick + notes[0].durationTicks;
    return previousTick;
  }


  drawVoicePairs() {
    let i = 0;
    for (const v of this.staveAndStaveNotesPair) {
      const pct = Math.round(i * 100 / this.staveAndStaveNotesPair.length);
      let tickStart = Number.MAX_SAFE_INTEGER;
      if (v.midiNotesTreble.length !== 0) {
        tickStart = v.midiNotesTreble[0][0].ticks;
      }
      if (v.midiNotesBass.length !== 0) {
        tickStart = Math.min(tickStart, v.midiNotesBass[0][0].ticks);
      }
      const timeSignature = this.getTimeSignature(tickStart);
      fillWithRest(v.staveTreble, v.staveNotesTreble, v.midiNotesTreble, timeSignature, this.ppq)
      fillWithRest(v.staveBass, v.staveNotesBass, v.midiNotesBass, timeSignature, this.ppq)
      v.xPositionsTreble = this.formatAndDraw(v.staveTreble, v.staveNotesTreble, v.midiNotesTreble, timeSignature);
      v.xPositionsBass = this.formatAndDraw(v.staveBass, v.staveNotesBass, v.midiNotesBass, timeSignature);
      i++;
    }
    const connector = new StaveConnector(
      this.staveAndStaveNotesPair[0].staveTreble,
      this.staveAndStaveNotesPair[0].staveBass,
    );
    this.staveAndStaveNotesPair[0].staveTreble.setBegBarType(BarlineType.NONE);
    this.staveAndStaveNotesPair[0].staveBass.setBegBarType(BarlineType.NONE);
    connector.setType('brace');
    connector.setContext(this.context).draw();
  }

  formatAndDraw(stave: Stave, stemmableNotes: StemmableNote[], midiNotes: Note[][], timeSig: ReducedFraction) {
    // console.log(timeSig, midiNotes, stave);
    // if (stemmableNotes==null || stemmableNotes.length === 0 || stave==null || timeSig==null) {
    //   return [0];
    // }
for (const note of stemmableNotes) {
      if (note == null || note.getDuration() === "0") {
        console.warn("Note with zero duration found, skipping", note);
        stemmableNotes.splice(stemmableNotes.indexOf(note), 1);    
      }
    }


    const numBeats = timeSig.numerator;
    const beatValue = timeSig.denominator;
    const voice = new Voice({ numBeats, beatValue })
      .setMode(Voice.Mode.SOFT)
      .addTickables(stemmableNotes).setStave(stave);
    const groups = Beam.getDefaultBeamGroups(`${numBeats}/${beatValue}`);
    const beams = Beam.applyAndGetBeams(voice, -1, groups);
    const startX = stave.getNoteStartX() % this.staveWidth
    this.simpleFormat(voice.getTickables(), midiNotes, timeSig, this.ppq, startX);
    voice.setContext(this.context).draw();
    this.generateBeamsAndDrawBeams(beams, numBeats, beatValue);
    return this.getXpositions(stemmableNotes);
  }

  simpleFormat(notes: Tickable[], midiNotes: Note[][], timeSig: ReducedFraction, ppq: number, startX: number): void {
    let i = 0;
    let lastX = 0;
    for (const note of notes) {
      let midiTick = 0;
      let rate = 0;
      const staveDurationTicks = getStaveDurationTick(timeSig, ppq)
      let midiTickNormalized = 0
      if (midiNotes[i].length > 0) {
        rate = (midiNotes[i][0].bars - Math.floor(midiNotes[i][0].bars))
        midiTick = midiNotes[i][0].ticks;
        midiTickNormalized = (rate * (this.staveWidth - (startX)));
      } else {
        midiTick = (staveDurationTicks / (i + 2));
        midiTickNormalized = lastX + 60;
      }
      const tickContext = new TickContext().addTickable(note).preFormat();
      tickContext.setX(midiTickNormalized);
      lastX = midiTickNormalized;
      i++;
    }
  }

  getXpositions(notes: StemmableNote[]): number[] {
    const xPositions = [];
    for (const note of notes) {
      const svgElement = note.getSVGElement();
      if (svgElement) {
        const rect = svgElement.getBoundingClientRect();
        const x = (rect.left + rect.right) / 2;
        xPositions.push(x);
        this.maxXPosition = Math.max(this.maxXPosition, x);
      }
    }
    return xPositions;
  }


  generateBeamsAndDrawBeams(beams: Beam[], numBeats: number, beatValue: number): Beam[] {
    const ctx = this.context
    const groups = Beam.getDefaultBeamGroups(`${numBeats}/${beatValue}`);
    const config = {
      groups: groups,
      stem_direction: 1,
      beam_rests: true,
      beam_middle_only: false,
      show_stemlets: true,
      maintain_stem_directions: true
    };
    // biome-ignore lint/complexity/noForEach: sounds cool
    beams.forEach((beam) => beam.setContext(ctx).draw());
    return beams
  }


  buildStaveNotes(pNotes: Note[], timeSig: ReducedFraction, clef: string, fingers?: number[]): StaveNote {
    const notes = pNotes.filter((n) => n.durationTicks !== 0);
    const noteNotations = notes.map((n, idx) => this.makeNoteNotationFromNote(n));
    if (notes.length === 0) {
      return null as unknown as StaveNote;
    }
    const detectedDuration = detectDuration(notes[0].durationTicks, timeSig, this.ppq)
    const note = new StaveNote({
      autoStem: true,
      clef: clef,
      keys: noteNotations,
      duration: detectedDuration.duration,
      dots: detectedDuration.dots,
    });
    if (fingers) {
      for (let i = 0; i < fingers.length; i++) {
        note.addModifier(new Annotation(fingers[i].toString()).setContext(this.context), 0);
      }
    }
    for (let i = 0; i < notes.length; i++) {
      if (noteNotations[i].includes("#")) {
        note.addModifier(new Accidental("#").setContext(this.context), i);
      }
    }
    for (let i = 0; i < detectedDuration.dots; i++) {
      note.addModifier(new Dot().setContext(this.context), 0);
    }
    note.setStyle({ fillStyle: "currentColor", strokeStyle: "currentColor" });
    return note;
  }

  makeNoteNotationFromNote(note: Note): string {
    const notenum = note.midi;
    const noteTxt = "C C#D D#E F F#G G#A A#B ".substring((notenum % 12) * 2, (notenum % 12) * 2 + 2).trim();
    const octave = Math.floor(notenum / 12) - 1;
    return `${noteTxt}/${octave}`;
  }

  getStartOffsetHint() {
    return this.stave_offset_hint;
  }

  getTimeSignature(tick: number) {
    let sig = this.midiObj?.header.timeSignatures.filter((ts) => {
      return ts.ticks <= tick;
    }).map(ts => ts.timeSignature).pop()
    if (sig == null) {
      sig = [4, 4];
    }
    return reducedFraction(sig[0], sig[1]);
  }

}
