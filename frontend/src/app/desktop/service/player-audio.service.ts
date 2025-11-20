import { Injectable } from '@angular/core';
import * as Tone from "tone";
import { Piano } from '@tonejs/piano';
import { Synthetizer } from "spessasynth_lib";

/**
 * Service responsable de la gestion de l'audio (synthétiseurs et soundfonts)
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
}
