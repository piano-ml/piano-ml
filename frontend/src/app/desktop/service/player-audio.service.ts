
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as Tone from "tone";
import { WorkletSynthesizer } from "spessasynth_lib";
import type { Note } from '@tonejs/midi/dist/Note';
import type * as Midi from '@tonejs/midi';
import { GOOD_RANGE, LiveStatus, PERFECT_RANGE, QUANT_RANGE, PlayerAssessService } from './player-assess.service';
import { PlayerStateService } from './player-state.service';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import { off } from 'process';

/**
 * Service responsable de la gestion de l'audio, des synthétiseurs et du scheduling des notes
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAudioService {

  private platformId = inject(PLATFORM_ID);

  spessasynth?: WorkletSynthesizer;
  pianoMLShouldPlay: boolean = false;

  constructor(
    private assess: PlayerAssessService,
    private state: PlayerStateService,
    private midiService: MidiServiceService
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.initSoundFont();
    }
  }


  getTransportSeconds(): number {
    return Tone.getTransport().seconds;
  }

  /**
   * Initialise le soundfont Spessasynth
   */
  async initSoundFont(): Promise<void> {
    if (this.spessasynth != null) {
      console.warn('Spessasynth already initialized');
      return; // already initialized
    }

    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/assets/soundfonts/spessasynth_processor.min.js");
    this.spessasynth = new WorkletSynthesizer(ctx);
    this.spessasynth.connect(ctx.destination);
    const response = await fetch("/assets/soundfonts/GeneralUserGS.sf3");
    const sfont = await response.arrayBuffer();
    await this.spessasynth.soundBankManager.addSoundBank(sfont, "main");
    await this.spessasynth.isReady;
    console.log('SoundFont initialized successfully');
  }



  /**
   * Schedule une note d'accompagnement
   */
  scheduleAccompanimentNote(
    channel: number,
    note: Note,
    startOffset: number,
    timeFactor: number,
    offset: number
  ): void {
    if (note.time < startOffset) return;
    if (note.midi === 0) return; // skip rest notes

    const noteStart = (note.time * timeFactor) - startOffset;
    const noteDuration = note.duration * timeFactor;

    // Note on
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOn(channel, note.midi, Math.round(note.velocity * 127));
    }, noteStart + offset);

    // Note off
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOff(channel, note.midi);
    }, noteStart + noteDuration + offset);
  }

  /**
   * Schedule toutes les notes d'une piste d'accompagnement
   */
  scheduleAccompanimentTrack(
    channel: number,
    track: Midi.Track,
    startTime: number,
    endCut: number,
    timeFactor: number,
    offset: number
  ): void {
    // Schedule notes
    for (const note of track.notes) {
      const noteTime = note.time * timeFactor;
      if (noteTime >= startTime && noteTime < endCut) {
        this.scheduleAccompanimentNote(channel, note, startTime, timeFactor, offset);
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
    timeFactor: number,
    offset: number
  ): void {

    for (const track of midi.tracks) {
      this.spessasynth?.programChange(track.channel, track.instrument.number);
      this.scheduleAccompanimentTrack(
        track.channel,
        track,
        startTime,
        endCut,
        timeFactor,
        offset
      );
    }
  }

  /**
   * Nettoie tous les événements schedulés
   */
  clearSchedule(): void {
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
    }, endTime);
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
    offset: number,
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
    }, noteTimeStart ? noteTimeStart + offset : 0);

    // Schedule piano audio start
    this.schedule((time: number) => {

      if (!this.isNotHandAwaited(hand, note.midi)) {
        this.midiService.pressOutput(note.midi, note.velocity);
        if (this.pianoMLShouldPlay) {
          this.spessasynth?.noteOn(0, note.midi, Math.round(note.velocity * 127));
        }
      }
    }, !this.isNotHandAwaited(hand, note.midi) ? noteTimeStart + offset : noteTimeStart);

    // Schedule note end (keyboard light off, piano audio stop)
    this.schedule((time: number) => {
      if (!this.isNotHandAwaited(hand, note.midi)) {
        this.midiService.releaseOutput(note.midi);
        if (this.pianoMLShouldPlay) {
          this.spessasynth?.noteOff(0, note.midi);
        }
      }

      this.scheduleDraw(() => {
        const liveStatus = this.assess.getExpectation();
        callbacks.onNoteEnd(time, note, liveStatus);
      }, time);
    }, !this.isNotHandAwaited(hand, note.midi) ? noteTimeEnd + offset : noteTimeEnd);

  }



  /**
   * Schedule toutes les notes d'une piste (main gauche ou droite)
   */
  scheduleHandTrack(
    hand: string,
    track: Midi.Track,
    startTime: number,
    endCut: number,
    offset: number,
    timeFactor: number,
    callbacks: {
      onNoteStart: (time: number, note: Note, liveStatus: LiveStatus) => void;
      onNoteEnd: (time: number, note: Note, liveStatus: LiveStatus) => void;
    }
  ): void {

    for (const note of track.notes) {
      const noteTime = note.time * timeFactor;
      if (noteTime >= startTime  && noteTime < endCut) {
        this.scheduleHandNote(hand, note, startTime, timeFactor, offset, callbacks);
      }
    }
  }


  async playMetronomeClick(isStrong: boolean): Promise<void> {
    const note = isStrong ? 34 : 33;   // 34 = Metronome Bell, 33 = Metronome Click
    const velocity = isStrong ? 110 : 80;
    this.spessasynth?.noteOn(9, note, velocity);
    this.midiService.pressDrum(note, 1);
    // Short release for crisp click (≈30-50ms)
    setTimeout(() => {
      this.midiService.releaseDrum(note);
      this.spessasynth?.noteOff(9, note);
    }, 40);
  }


  /**
   * Décompte de mesure précis avant le départ, basé sur Tone.Transport
   */
  startCountIn(bar: number, timeSigEvent: TimeSignatureEvent, bpm: number): number {
    let offset = 0;
    const [numerator, denominator] = timeSigEvent?.timeSignature || [4, 4];
    const beatUnitFactor = 4 / denominator;
    const beatDurationMs = (60000 / bpm);
    const beatsPerBar = (denominator === 8 && numerator % 3 === 0)
      ? numerator / 3   // mesure composée
      : numerator;
    // count-in only
    if (!this.state.playConfiguration.useMetronome) {
      for (let i = 0; i < beatsPerBar * bar; ++i) {
        offset = (i * beatUnitFactor * beatDurationMs / 1000);
        Tone.getTransport().scheduleOnce((time: number) => {
          this.playMetronomeClick(i % beatsPerBar === 0);
        }, `${i * beatUnitFactor * beatDurationMs / 1000}`);
      }
    // metronome scheduleRepeat all along
    } else {
      Tone.getTransport().scheduleRepeat((time: number) => {
        const currentBeat = Math.floor((time * 1000) / beatDurationMs) % beatsPerBar;
        this.playMetronomeClick(currentBeat === 0);
      }, beatUnitFactor * beatDurationMs / 1000, 0);
      offset = beatsPerBar * bar * beatUnitFactor * beatDurationMs / 1000;  
    }
    return offset;
  }



}
