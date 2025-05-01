import { type ElementRef, Injectable } from '@angular/core';
import { Accidental, Annotation, BarlineType, Beam, Dot, type FormatParams, Formatter, type FormatterOptions, type Fraction, type RenderContext, Renderer, Stave, StaveConnector, StaveNote, type StemmableNote, TickContext, Voice } from 'vexflow';
import type * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import { BehaviorSubject, ReplaySubject } from 'rxjs';
import type { StaveAndStaveNotesPair } from '../model/model';
import { HandDetectorService } from './hand-detector.service';
import { compareFractions, reducedFraction, type ReducedFraction } from '../model/reduced-fraction';
import { getBar, detectDuration } from './music-theory';
import { fillWithRest } from './rest-filler';


@Injectable({
  providedIn: 'root'
})
export class EngravingService {

  width = 16480;
  height = 320;
  stave_width = 460;
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
  staveDuration!: number;
  previousTimeSignature: ReducedFraction | null = null

  midiObj!: Midi.Midi;
  doStaffSplit = false;
  fingering: number[][][] | undefined;
  scale = 1.2;

  renderScore(nativeElementRef: ElementRef, width: number) {
    console.log("render score", width)
    if (!this.midiObj) {
      console.error("midi object not loaded in vexflow service")
      return;
    }
    //this.width = width;
    this.scoreElementRef = nativeElementRef.nativeElement;
    if (!this.scoreElementRef) {
      throw new Error('Score element not found');
    }
    console.log("rendering score")
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
    const w = this.stave_width;


    const staveTreeble = new Stave(this.stave_offset_hint + (w * idx), 20, w);
    const staveBass = new Stave(this.stave_offset_hint + (w * idx), (this.height / 2) -40, w);
    if (idx === 0 || this.previousTimeSignature == null || compareFractions(this.previousTimeSignature, timesig) !== 0) {
      staveTreeble.addClef('treble').addTimeSignature(`${beat_value}/${num_beats}`).setBegBarType(BarlineType.NONE);
      staveBass.addClef('bass').addTimeSignature(`${beat_value}/${num_beats}`).setBegBarType(BarlineType.NONE);
    }
    staveBass.setMeasure(idx);
    staveTreeble.setMeasure(idx);

    staveBass.setContext(this.context).draw();
    staveTreeble.setContext(this.context).draw();

    const vp = {
      staveNotesTreeble: [],
      staveNotesBass: [],
      staveTreeble: staveTreeble,
      staveBass: staveBass,
      midiNotesTreeble: [],
      midiNotesBass: [],
      xPositionsTreeble: [],
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
          //const key = `${currentValue.ticks}-${currentValue.durationTicks}`;
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
    //console.log("maxXPosition", this.maxXPosition)
    //this.renderer.resize(this.maxXPosition + this.stave_width  , this.height);
  }

  buildHand(notes: Note[], _previousTick: number, clef: string, fingers?: number[]) {
    let previousTick = _previousTick
    const tick = notes[0].ticks;

    const timesig = this.getTimeSignature(tick);
    const voicePair = this.getOrMakeVoice(getBar(notes[0]), timesig);
    const stave = clef === "treble" ? voicePair.staveTreeble : voicePair.staveBass;
    const staveNotes = clef === "treble" ? voicePair.staveNotesTreeble : voicePair.staveNotesBass;
    const note = this.buildStaveNotes(notes, stave, clef, fingers);

    if (clef === "treble") {
      voicePair.midiNotesTreeble.push(notes);
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
      console.log(`engraving ${i} of ${this.staveAndStaveNotesPair.length} (${pct}%)`);
      let tickStart = Number.MAX_SAFE_INTEGER;
      if (v.midiNotesTreeble.length !== 0) {
        tickStart = v.midiNotesTreeble[0][0].ticks;
      }
      if (v.midiNotesBass.length !== 0) {
        tickStart = Math.min(tickStart, v.midiNotesBass[0][0].ticks);
      }
      const timeSignature = this.getTimeSignature(tickStart);
      fillWithRest(v.staveTreeble, v.staveNotesTreeble, v.midiNotesTreeble, timeSignature, this.ppq)
      fillWithRest(v.staveBass, v.staveNotesBass, v.midiNotesBass, timeSignature, this.ppq)
      v.xPositionsTreeble = this.formatAndDraw(v.staveTreeble, v.staveNotesTreeble, timeSignature.numerator, timeSignature.denominator);
      v.xPositionsBass = this.formatAndDraw(v.staveBass, v.staveNotesBass, timeSignature.numerator, timeSignature.denominator);
      i++;
    }
    const connector = new StaveConnector(
      this.staveAndStaveNotesPair[0].staveTreeble,
      this.staveAndStaveNotesPair[0].staveBass,
    );
    this.staveAndStaveNotesPair[0].staveTreeble.setBegBarType(BarlineType.NONE);
    this.staveAndStaveNotesPair[0].staveBass.setBegBarType(BarlineType.NONE);
    connector.setType('brace');
    connector.setContext(this.context).draw();

  }

  formatAndDraw(
    stave: Stave,
    notes: StemmableNote[],
    numBeats: number,
    beatValue: number
  ): number[] {
    const ctx = this.context
    const xPositions = [];
   
    const voice = new Voice({numBeats, beatValue })
      .setMode(Voice.Mode.SOFT)
      .addTickables(notes);

    // if (num_beats === 4 && beat_value === 4) {
    //   groups = [new Fraction(3, 8), new Fraction(3, 8)]
    // } else {
    const groups = Beam.getDefaultBeamGroups(`${numBeats}/${beatValue}`);
    // }
    const config = {
      groups: groups,
      stem_direction: -1,
      beam_rests: false,
      beam_middle_only: false,
      show_stemlets: false
    };
    const beams = Beam.generateBeams(notes, config);
    const formatParams: FormatParams = {
      stave: stave,
      alignRests: false,
      autoBeam: true
    };
    const formatterOptions: FormatterOptions = {
      softmaxFactor: 10,
      globalSoftmax: true,
      maxIterations: 5
    }
    const justifyWidth = stave.getWidth() - 70;
    new Formatter(formatterOptions)
      .joinVoices([voice])
      .format([voice], justifyWidth, formatParams);
    voice.setStave(stave).draw(ctx, stave);
    // biome-ignore lint/complexity/noForEach: <explanation>
    beams.forEach((beam) => beam.setContext(ctx).draw());
    stave.setContext(ctx).draw();
    for (const note of notes) {
      const svgElement = note.getSVGElement();
      if (svgElement) {
        const rect = svgElement.getBoundingClientRect();
        const x = (rect.left + rect.right) / 2;
        xPositions.push(x);
        this.maxXPosition= Math.max(this.maxXPosition, x);
      }
    }
    return xPositions;
  }



  buildStaveNotes(notes: Note[], stave: Stave, clef: string, fingers?: number[]): StaveNote {
    const noteNotations = notes.map((n, idx) => this.makeNoteNotationFromNote(n));

    const detectedDuration = detectDuration(notes[0].durationTicks, this.ppq)
    try {
      const note = new StaveNote({
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
      note.setContext(this.context).setStave(stave);
      return note;

    } catch (e) {
      console.error("error", notes, detectedDuration)
      throw e
    }

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


