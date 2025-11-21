import { Injectable } from '@angular/core';
import * as Tone from "tone";
import { Piano } from '@tonejs/piano';
import { Synthetizer } from "spessasynth_lib";
import type { Note } from '@tonejs/midi/dist/Note';
import type * as Midi from '@tonejs/midi';

/**
 * Service responsable de la gestion de l'audio, des synthétiseurs et du scheduling des notes
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAudioService {
  synth: Tone.Synth<Tone.SynthOptions> | undefined;
  spessasynth?: Synthetizer;
  piano: any;

  constructor() {
    this.initSoundFont();
    this.initPiano();
    this.synth = new Tone.Synth().toDestination();
  }

  /**
   * Initialise le soundfont Spessasynth
   */
  async initSoundFont(): Promise<void> {
    if (this.spessasynth != null) {
      return; // already initialized
    }
    
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/assets/soundfonts/worklet_processor.min.js");
    
    fetch("assets/soundfonts/GeneralUserGS.sf3").then(async response => {
      const sfont = await response.arrayBuffer();
      this.spessasynth = new Synthetizer(ctx.destination, sfont, false);
      this.spessasynth.resetControllers();
    });
  }

  /**
   * Initialise le piano Tone.js
   */
  initPiano(): void {
    this.piano = new Piano({
      velocities: 1
    }).toDestination();
    this.piano.load();
  }

  /**
   * Arrête tous les sons en cours
   */
  stopAll(): void {
    this.spessasynth?.stopAll();
  }

  /**
   * Change le programme MIDI pour un canal donné
   */
  programChange(channel: number, program: number): void {
    this.spessasynth?.programChange(channel, program);
  }

  /**
   * Déclenche une note MIDI
   */
  noteOn(channel: number, midiNote: number, velocity: number): void {
    this.spessasynth?.noteOn(channel, midiNote, velocity);
  }

  /**
   * Arrête une note MIDI
   */
  noteOff(channel: number, midiNote: number): void {
    this.spessasynth?.noteOff(channel, midiNote);
  }

  /**
   * Déclenche une touche du piano
   */
  pianoKeyDown(params: { time: number; velocity: number; note: string; midi: number }): void {
    this.piano.keyDown(params);
  }

  /**
   * Relâche une touche du piano
   */
  pianoKeyUp(params: { time: number; velocity: number; note: string; midi: number }): void {
    this.piano.keyUp(params);
  }

  /**
   * Schedule une note d'accompagnement
   */
  scheduleAccompanimentNote(
    channel: number,
    note: Note,
    startOffset: number,
    timeFactor: number
  ): void {
    if (note.time < startOffset) return;
    if (note.midi === 0) return; // skip rest notes
    
    const noteStart = (note.time * timeFactor) - startOffset;
    const noteDuration = note.duration * timeFactor;
    
    // Note on
    Tone.getTransport().schedule(() => {
      this.noteOn(channel, note.midi, Math.round(note.velocity * 127));
    }, noteStart);
    
    // Note off
    Tone.getTransport().schedule(() => {
      this.noteOff(channel, note.midi);
    }, noteStart + noteDuration);
  }

  /**
   * Schedule toutes les notes d'une piste d'accompagnement
   */
  scheduleAccompanimentTrack(
    channel: number,
    track: Midi.Track,
    startTime: number,
    endCut: number,
    timeFactor: number
  ): void {
    // Schedule notes
    for (const note of track.notes) {
      const noteTime = note.time * timeFactor;
      if (noteTime >= startTime && noteTime < endCut) {
        this.scheduleAccompanimentNote(channel, note, startTime, timeFactor);
      }
    }
  }

  /**
   * Schedule toutes les pistes d'accompagnement
   */
  scheduleAccompanimentTracks(
    midi: Midi.Midi,
    startTime: number,
    endCut: number,
    timeFactor: number
  ): void {
    for (const track of midi.tracks) {
      this.programChange(track.channel, track.instrument.number);
      this.scheduleAccompanimentTrack(
        track.channel,
        track,
        startTime,
        endCut,
        timeFactor
      );
    }
  }

  /**
   * Nettoie tous les événements schedulés
   */
  clearSchedule(): void {
    Tone.getTransport().cancel();
  }

  /**
   * Démarre le transport
   */
  async start(): Promise<void> {
    await Tone.start();
    Tone.getTransport().start();
  }

  /**
   * Met en pause le transport
   */
  pause(): void {
    this.stopAll();
    Tone.getTransport().pause();
  }

  /**
   * Arrête et réinitialise le transport
   */
  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    this.clearSchedule();
    Tone.getDraw().dispose();
    Tone.getDraw().cancel();
  }

  /**
   * Schedule la fin de la lecture
   */
  scheduleEnd(endTime: number, onEndCallback: () => void): void {
    Tone.getTransport().schedule(() => {
      this.stopAll();
      onEndCallback();
    }, endTime + 3);
  }

  /**
   * Obtient le temps actuel du transport
   */
  getCurrentTime(): number {
    return Tone.getTransport().seconds;
  }

  /**
   * Vérifie si le transport est en cours de lecture
   */
  isPlaying(): boolean {
    return Tone.getTransport().state === 'started';
  }

  /**
   * Schedule une callback à un temps donné
   */
  schedule(callback: (time: number) => void, time: number): void {
    Tone.getTransport().schedule(callback, time);
  }

  /**
   * Schedule dans le contexte de dessin (pour les updates UI)
   */
  scheduleDraw(callback: () => void, time: number): void {
    Tone.getDraw().schedule(callback, time);
  }

  /**
   * Schedule une note de main (gauche ou droite) avec tous ses événements
   */
  scheduleHandNote(
    hand: string,
    note: Note,
    startTime: number,
    timeFactor: number,
    goodRange: number,
    callbacks: {
      onNoteStart: (time: number, note: Note) => void;
      onNoteEnd: (time: number, note: Note) => void;
      beforeGoodRange: (time: number, note: Note) => void;
    }
  ): void {
    const noteTimeStart = (note.time * timeFactor) - startTime;
    const noteTimeEnd = noteTimeStart + (note.duration * timeFactor);

    // Schedule note start (UI updates, cursor advance, keyboard light on)
    this.schedule((time: number) => {
      this.scheduleDraw(() => {
        callbacks.onNoteStart(time, note);
      }, time);
    }, noteTimeStart);

    // Schedule piano audio start
    this.schedule((time: number) => {
      this.pianoKeyDown({
        time: time,
        velocity: note.velocity,
        note: note.name,
        midi: note.midi
      });
    }, noteTimeStart);

    // Schedule note end (keyboard light off, piano audio stop)
    this.schedule((time: number) => {
      this.pianoKeyUp({
        time: time + note.duration,
        velocity: note.velocity,
        note: note.name,
        midi: note.midi
      });

      this.scheduleDraw(() => {
        callbacks.onNoteEnd(time, note);
      }, time);
    }, noteTimeEnd);

    // Schedule "good range" check (before the note should be played)
    this.schedule((time: number) => {
      this.scheduleDraw(() => {
        callbacks.beforeGoodRange(time, note);
      }, time);
    }, Math.max(noteTimeStart - goodRange, 0));
  }

  /**
   * Schedule toutes les notes d'une piste (main gauche ou droite)
   */
  scheduleHandTrack(
    hand: string,
    track: Midi.Track,
    startTime: number,
    endCut: number,
    timeFactor: number,
    goodRange: number,
    callbacks: {
      onNoteStart: (time: number, note: Note) => void;
      onNoteEnd: (time: number, note: Note) => void;
      beforeGoodRange: (time: number, note: Note) => void;
    }
  ): void {
    for (const note of track.notes) {
      const noteTime = note.time * timeFactor;
      if (noteTime >= startTime && noteTime < endCut) {
        this.scheduleHandNote(hand, note, startTime, timeFactor, goodRange, callbacks);
      }
    }
  }
}
