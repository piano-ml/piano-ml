import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as Tone from "tone";
import { Piano } from '@tonejs/piano';
import { Synthetizer } from "spessasynth_lib";
import type { Note } from '@tonejs/midi/dist/Note';
import type * as Midi from '@tonejs/midi';
import { GOOD_RANGE, LiveStatus, PERFECT_RANGE, QUANT_RANGE, PlayerAssessService } from './player-assess.service';
import { PlayerStateService } from './player-state.service';
import { MidiServiceService } from '../../shared/services/midi-service.service';

/**
 * Service responsable de la gestion de l'audio, des synthétiseurs et du scheduling des notes
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAudioService {
  private platformId = inject(PLATFORM_ID);
  synth: Tone.Synth<Tone.SynthOptions> | undefined;
  spessasynth?: Synthetizer;
  piano: any;
  pianoMLShouldPlay: boolean = false;

  constructor(
    private assess: PlayerAssessService,
    private state: PlayerStateService,
    private midiService: MidiServiceService
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.initSoundFont();
      this.initPiano();
      this.synth = new Tone.Synth().toDestination();
    }
  }

  /**
   * Initialise le soundfont Spessasynth
   */
  async initSoundFont(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      console.log('SoundFont initialization skipped on server');
      return;
    }
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
    if (!isPlatformBrowser(this.platformId)) {
      console.log('Piano initialization skipped on server');
      return;
    }
    this.piano = new Piano({
      velocities: 1
    }).toDestination();
    this.piano.load();
    console.log('Piano loaded');
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
      this.spessasynth?.noteOn(channel, note.midi, Math.round(note.velocity * 127));
    }, noteStart);

    // Note off
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOff(channel, note.midi);
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
      this.spessasynth?.programChange(track.channel, track.instrument.number);
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
    console.log('Clearing scheduled events');
    Tone.getTransport().cancel();
    Tone.getDraw().cancel();
  }

  /**
   * Démarre le transport
   */
  async start(): Promise<void> {
    this.pianoMLShouldPlay = this.midiService.pianoMLShouldPlay();
    await Tone.start();
    Tone.getTransport().start();
  }

  /**
   * Met en pause le transport
   */
  pause(): void {
    this.spessasynth?.stopAll();
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
      this.spessasynth?.stopAll();
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

  private isNotHandAwaited(hand: string, midiPitch: number) {
    return (((hand === 'rh' && this.state.playConfiguration.waitForRightHand)
      || (hand === 'lh' && this.state.playConfiguration.waitForLeftHand))
      && (midiPitch >= this.state.leftmostKey && midiPitch <= this.state.rightmostKey)
    );
  }

  /**
   * Schedule une note de main (gauche ou droite) avec tous ses événements
   */
  scheduleHandNote(
    hand: string,
    note: Note,
    startTime: number,
    timeFactor: number,
    callbacks: {
      onNoteStart: (time: number, note: Note, liveStatus: LiveStatus) => void;
      onNoteEnd: (time: number, note: Note, liveStatus: LiveStatus) => void;
    }
  ): void {
    const noteTimeStart = (note.time * timeFactor) - startTime;
    const noteTimeEnd = noteTimeStart + (note.duration * timeFactor);

    // Schedule note start (UI updates, cursor advance, keyboard light on)
    this.schedule((time: number) => {
      this.scheduleDraw(() => {
        if (this.isNotHandAwaited(hand, note.midi)) {
          const liveStatus = this.assess.learnExpectation(this.getCurrentTime(), noteTimeEnd, note, hand);
          callbacks.onNoteStart(time, note, liveStatus);
        } else {
          const liveStatus = this.assess.getExpectation();
          callbacks.onNoteStart(time, note, liveStatus);
        }
      }, time);
    }, noteTimeStart ? noteTimeStart : 0);

    // Schedule piano audio start
    this.schedule((time: number) => {

      if (!this.isNotHandAwaited(hand, note.midi)) {
        this.midiService.pressOutput(note.midi, note.velocity);
        if (this.pianoMLShouldPlay) {
          this.piano.keyDown({
            time: time,
            velocity: note.velocity,
            note: note.name,
            midi: note.midi
          });
        }
      }
    }, !this.isNotHandAwaited(hand, note.midi) ? noteTimeStart + PERFECT_RANGE : noteTimeStart);

    // Schedule note end (keyboard light off, piano audio stop)
    this.schedule((time: number) => {
      if (!this.isNotHandAwaited(hand, note.midi)) {
        this.midiService.releaseOutput(note.midi);
        if (this.pianoMLShouldPlay) {
          this.piano.keyUp({
            time: time,
            velocity: note.velocity,
            note: note.name,
            midi: note.midi
          });
        }
      }

      this.scheduleDraw(() => {
        const liveStatus = this.assess.getExpectation();
        callbacks.onNoteEnd(time, note, liveStatus);
      }, time);
    }, !this.isNotHandAwaited(hand, note.midi) ? noteTimeEnd + PERFECT_RANGE : noteTimeEnd);

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
    callbacks: {
      onNoteStart: (time: number, note: Note, liveStatus: LiveStatus) => void;
      onNoteEnd: (time: number, note: Note, liveStatus: LiveStatus) => void;
    }
  ): void {

    for (const note of track.notes) {
      const noteTime = note.time * timeFactor;
      if (noteTime >= startTime && noteTime < endCut) {
        this.scheduleHandNote(hand, note, startTime, timeFactor, callbacks);
      }
    }
  }
}
