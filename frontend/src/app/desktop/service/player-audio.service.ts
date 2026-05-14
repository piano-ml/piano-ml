
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as Tone from "tone";
import { WorkletSynthesizer } from "spessasynth_lib";
import type { Note } from '@tonejs/midi/dist/Note';
import type * as Midi from '@tonejs/midi';
import { LiveStatus,  PlayerAssessService } from './player-assess.service';
import { PlayerStateService } from './player-state.service';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import { TimeSignatureEvent } from '@tonejs/midi/dist/Header';

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
    const transport = Tone.getTransport();
    const roundedVelocity = Math.round(note.velocity * 127);

    // Note on
    transport.schedule(() => {
      this.spessasynth?.noteOn(channel, note.midi, roundedVelocity);
    }, noteStart + offset);

    // Note off
    transport.schedule(() => {
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
    // Notes are time-ordered: skip early notes, then stop once we pass the end window.
    for (let i = 0; i < track.notes.length; i++) {
      const note = track.notes[i];
      const noteTime = note.time * timeFactor;
      if (noteTime < startTime) continue;
      if (noteTime >= endCut) break;
      this.scheduleAccompanimentNote(channel, note, startTime, timeFactor, offset);
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
      const channel = track.channel + 2; // avoid conflict with piano track (0 and 1)
      this.spessasynth?.programChange(channel, track.instrument.number);
      this.scheduleAccompanimentTrack(
        channel,
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
    const transport = Tone.getTransport();
    const draw = Tone.getDraw();
    transport.cancel();
    draw.cancel();
  }

  /**
   * Démarre le transport
   */
  async start(): Promise<void> {
    this.pianoMLShouldPlay = this.midiService.pianoMLShouldPlay();
    if (!this.spessasynth) {
      await this.initSoundFont();
    }
    await Tone.start();
    const transport = Tone.getTransport();
    if (transport.state !== 'started') {
      transport.start();
    }
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
    const transport = Tone.getTransport();
    const draw = Tone.getDraw();
    transport.stop();
    transport.position = 0;
    this.clearSchedule();
    draw.dispose();
    draw.cancel();
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
    const playConfig = this.state.playConfiguration;
    const isHandAwaited = (((hand === 'rh' && playConfig.waitForRightHand)
      || (hand === 'lh' && playConfig.waitForLeftHand))
      && (note.midi >= this.state.leftmostKey && note.midi <= this.state.rightmostKey)
    );

    // Calculate consistent timing: audio & UI both use offset when hand is not awaited
    const scheduleStartTime = !isHandAwaited ? noteTimeStart + offset : noteTimeStart;
    const scheduleEndTime = !isHandAwaited ? noteTimeEnd + offset : noteTimeEnd;
    
    // Cache transport & draw to avoid repeated accessor calls
    const transport = Tone.getTransport();
    const draw = Tone.getDraw();
    const roundedVelocity = Math.round(note.velocity * 127);

    // Schedule note start (UI updates, cursor advance, keyboard light on)
    transport.schedule((time: number) => {
      draw.schedule(() => {
        if (isHandAwaited) {
          const liveStatus = this.assess.learnExpectation(this.getCurrentTime(), noteTimeEnd, note, hand);
          callbacks.onNoteStart(time, note, liveStatus);
        } else {
          const liveStatus = this.assess.getExpectation();
          callbacks.onNoteStart(time, note, liveStatus);
        }
      }, time);
    }, scheduleStartTime);

    // Schedule piano audio start
    transport.schedule((time: number) => {
      if (!isHandAwaited) {
        this.midiService.pressOutput(note.midi, note.velocity);
        if (this.pianoMLShouldPlay) {
          this.spessasynth?.noteOn(0, note.midi, roundedVelocity);
        }
      } 
    }, scheduleStartTime);

    // Schedule note end (keyboard light off, piano audio stop)
    transport.schedule((time: number) => {
      if (!isHandAwaited) {
        this.midiService.releaseOutput(note.midi);
        if (this.pianoMLShouldPlay) {
          this.spessasynth?.noteOff(0, note.midi);
        }
      }

      draw.schedule(() => {
        const liveStatus = this.assess.getExpectation();
        callbacks.onNoteEnd(time, note, liveStatus);
      }, time);
    }, scheduleEndTime);

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

    // Notes are time-ordered: skip early notes, then stop once we pass the end window.
    for (let i = 0; i < track.notes.length; i++) {
      const note = track.notes[i];
      const noteTime = note.time * timeFactor;
      if (noteTime < startTime) continue;
      if (noteTime >= endCut) break;
      this.scheduleHandNote(hand, note, startTime, timeFactor, offset, callbacks);
    }
  }


  playMetronomeClick(isStrong: boolean): void {
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
    const stepSeconds = beatUnitFactor * beatDurationMs / 1000;
    const beatsPerBar = (denominator === 8 && numerator % 3 === 0)
      ? numerator / 3   // mesure composée
      : numerator;
    
    // Cache transport to avoid repeated accessor calls in loop
    const transport = Tone.getTransport();
    
    for (let i = 0; i <= beatsPerBar * bar; i++) {
      offset = i * stepSeconds;

      transport.scheduleOnce((_time: number) => {
        this.playMetronomeClick(i % beatsPerBar === 0);
      }, `${i * stepSeconds}`);
    }
    // metronome all allong
    if (this.state.playConfiguration.useMetronome) {
      transport.scheduleRepeat((time: number) => {
        const currentBeat = Math.floor((time * 1000) / beatDurationMs) % beatsPerBar;
        this.playMetronomeClick(currentBeat === 0);
      }, stepSeconds, offset);
    }
    return offset;
  }



}
