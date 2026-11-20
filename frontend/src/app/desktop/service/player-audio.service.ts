
import { Injectable, inject, OnDestroy, DestroyRef, NgZone, isDevMode, signal } from '@angular/core';
import * as Tone from "tone";
import { WorkletSynthesizer } from "spessasynth_lib";
import type { Note } from '@tonejs/midi/dist/Note';
import type * as Midi from '@tonejs/midi';
import { GOOD_RANGE, LiveStatus, PlayerAssessService } from './player-assess.service';
import { PlayerStateService } from './player-state.service';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import { SOUNDFONT_WORKLET_URL, loadSoundFontFile } from '../../shared/services/soundfont-cache';
import {
  CALIBRATION_BPM, CALIBRATION_CLICKS, CALIBRATION_WARMUP_CLICKS, calibrationOffsetMs, readLatencyCalibration, writeLatencyCalibration,
} from './latency-calibration';
import { findClickOnsets } from './mic-onsets';
import { MicrophoneService } from './microphone.service';
import { withListenerParams } from './audio-listener';

export { isCompleteRiff } from '../../shared/services/soundfont-cache';

/**
 * User Timing mark set at the first synth note-on after each start(), in dev builds only: scripts/measure-playback.mjs
 * reads it to measure the delay between the Play click and the first sound.
 */
export const FIRST_SOUND_MARK = 'pianoml:first-sound';

/**
 * How far ahead Tone schedules (its default is 0.1 s): the synth plays a note when its callback runs, not at the
 * scheduled time, so the onsets jittered by up to half the update interval and the sound ran ahead of the visuals.
 * Tone's updateInterval follows at half this value.
 */
export const PLAYBACK_LOOKAHEAD_S = 0.03;

/**
 * Notes are put on the transport this far ahead of it, topped up every SCHEDULE_REFILL_S: Play no longer schedules
 * every event of a long score at once (2 per note, plus Tone's timeline growing with them).
 */
export const SCHEDULE_AHEAD_S = 4;
export const SCHEDULE_REFILL_S = 1;

/** Velocity of the metronome clicks while the score plays. */
export const METRONOME_VELOCITY = 43;
/** Velocity of the count-in and calibration clicks: full volume, the user has to catch the beat from them. */
export const METRONOME_FULL_VELOCITY = 127;
/** How the timing calibration hears the user (see PlayerAudioService.calibrateLatency()). */
export type CalibrationMode = 'loopback' | 'midi';
/** One tap (or sound heard) during a calibration, as it comes: for the dialog to show. */
export interface CalibrationTap {
  /** The nearest click, 0-based. */
  click: number;
  /** How long after that click it was heard (negative: before). */
  ms: number;
  /** Whether it counts: not a warm-up click, and close enough to its click. */
  measured: boolean;
}
/** How long a metronome click sounds before its note-off (a crisp click). */
export const METRONOME_CLICK_S = 0.04;
/** MIDI controller "All Sound Off": stops every voice of a channel at once. */
const ALL_SOUND_OFF = 120;
/** The first calibration click comes this long after the user asked for it... */
const CALIBRATION_LEAD_S = 0.8;
/** ...and later with the microphone, which takes a moment to start recording. */
const CALIBRATION_MIC_LEAD_S = 1;
const MIDI_CHANNELS = 16;

/**
 * The one AudioContext of the page, shared by Tone (the scheduling clock) and spessasynth (the sound): with a
 * single clock, a note scheduled at a Tone time sounds at exactly that time. Kept across service instances
 * (it is a page resource, like Tone's global context).
 */
let sharedAudioContext: AudioContext | undefined;
function audioContextOfThePage(): AudioContext {
  // The smallest buffer the device allows (clamped by the browser): the least latency between a key and its sound
  sharedAudioContext ??= withListenerParams(new AudioContext({ latencyHint: 0 }));
  return sharedAudioContext;
}


/**
 * Service responsable de la gestion de l'audio, des synthétiseurs et du scheduling des notes
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAudioService implements OnDestroy {

  spessasynth?: WorkletSynthesizer;
  pianoMLShouldPlay: boolean = false;
  private audioContext?: AudioContext;
  private initSoundFontPromise?: Promise<void>;
  private startPromise?: Promise<void>;
  private destroyRef = inject(DestroyRef);
  private ngZone = inject(NgZone);
  private toneReady = false;
  /** Notes waiting to be put on the transport, by start time (see startRollingSchedule()). */
  private pending: { time: number; schedule: () => void }[] = [];
  private nextPending = 0;
  /** Latest time a note-on was queued in the synth for: a pause before it must cancel it (see pause()). */
  private lastQueuedNoteOn = 0;
  private soundFontAbortController?: AbortController;
  /** Set by start() in dev builds: the next note-on sets FIRST_SOUND_MARK. */
  private firstSoundPending = false;
  /**
   * The tap-along calibration's correction, in ms (see latency-calibration.ts): what the browser's latency figures
   * miss. Key presses are scored this much earlier.
   */
  readonly latencyCalibrationMs = signal(readLatencyCalibration());
  /** The soundfont (about 10 MB) and its synth: Play is only offered once they are 'ready'. */
  readonly soundFontState = signal<'loading' | 'ready' | 'error'>('loading');

  constructor(
    private assess: PlayerAssessService,
    private state: PlayerStateService,
    private midiService: MidiServiceService,
    private microphone: MicrophoneService,
  ) { }


  /**
   * Tone's context, created on first use outside the Angular zone: its ticker and the Draw animation frames then
   * no longer run change detection app-wide many times per second. The UI still updates through signals and
   * markForCheck, which schedule change detection on their own.
   */
  private ensureTone(): void {
    if (this.toneReady) return;
    this.toneReady = true;
    this.audioContext ??= audioContextOfThePage();
    const audioContext = this.audioContext;
    this.ngZone.runOutsideAngular(() => {
      if (Tone.getContext().rawContext !== audioContext) {
        Tone.setContext(audioContext);
      }
      Tone.getContext().lookAhead = PLAYBACK_LOOKAHEAD_S;
    });
  }

  private transport() {
    this.ensureTone();
    return Tone.getTransport();
  }

  private draw() {
    this.ensureTone();
    return Tone.getDraw();
  }

  /**
   * Every synth note-on goes through here. `time` is the audio context time Tone scheduled it for: the synth plays
   * it at that sample, instead of whenever the callback ran (up to the lookahead early, with jitter).
   */
  private noteOn(channel: number, midi: number, velocity: number, time?: number): void {
    if (this.firstSoundPending) {
      this.firstSoundPending = false;
      performance.mark(FIRST_SOUND_MARK);
    }
    if (time !== undefined) {
      this.lastQueuedNoteOn = Math.max(this.lastQueuedNoteOn, time);
    }
    this.spessasynth?.noteOn(channel, midi, velocity, time === undefined ? undefined : { time });
  }

  private noteOff(channel: number, midi: number, time?: number): void {
    this.spessasynth?.noteOff(channel, midi, time === undefined ? undefined : { time });
  }

  /**
   * Seconds between the context rendering a sample and the user hearing it, as the browser reports it: from a few
   * ms (wired) to a quarter of a second (Bluetooth headphones).
   */
  outputLatency(): number {
    const context = this.audioContext;
    return context ? (context.outputLatency || context.baseLatency || 0) : 0;
  }

  /**
   * The audio context time being heard at `perfMs` (a performance.now() time, like a MIDI event's timeStamp):
   * the context time minus what is still on its way to the speakers.
   */
  heardContextTime(perfMs: number = performance.now()): number {
    const context = this.audioContext;
    if (!context) return 0;
    const stamp = context.getOutputTimestamp?.();
    if (stamp?.contextTime && stamp.performanceTime) {
      return stamp.contextTime + (perfMs - stamp.performanceTime) / 1000;
    }
    return context.currentTime - this.outputLatency() + (perfMs - performance.now()) / 1000;
  }

  /** How far what is heard lags the context time now, in seconds, as the scoring sees it (see heardContextTime()). */
  getContextTimeLag(): number {
    return this.audioContext ? this.audioContext.currentTime - this.heardContextTime() : 0;
  }

  /** When the audio context time `time` is heard, as a performance.now() time: for timestamped MIDI output. */
  contextToPerformanceMs(time: number): number {
    return performance.now() + (time - this.heardContextTime()) * 1000;
  }

  /**
   * The score position (transport seconds) the user hears at `perfMs`, less the calibration correction: what a key
   * pressed then is scored against.
   */
  heardTransportSeconds(perfMs: number = performance.now()): number {
    const context = this.heardContextTime(perfMs) - this.latencyCalibrationMs() / 1000;
    return this.transport().getSecondsAtTime(Math.max(0, context));
  }

  setLatencyCalibration(ms: number): void {
    this.latencyCalibrationMs.set(ms);
    writeLatencyCalibration(ms);
  }

  /**
   * Timing calibration: plays CALIBRATION_CLICKS clicks and collects when each one was answered, then resolves with
   * the correction (also applied and stored), or null without enough answers on the beat. `signal` cancels it.
   * - 'loopback' (the default in the dialog): no one taps, the microphone hears the clicks from the speakers (what
   *   the speakers add to the latency the browser reports); rejects when it cannot be opened (permission, no device);
   * - 'midi': the user taps a key of their MIDI keyboard on each click (the keyboard's own delay included).
   */
  async calibrateLatency(signal?: AbortSignal, mode: CalibrationMode = 'midi', onTap?: (tap: CalibrationTap) => void): Promise<number | null> {
    await this.initSoundFont();
    const context = this.audioContext!;
    if (context.state === 'suspended') {
      await context.resume();
    }
    const taps: number[] = [];
    const interval = 60 / CALIBRATION_BPM;
    const warmup = mode === 'loopback' ? 0 : CALIBRATION_WARMUP_CLICKS; // nobody has to find the beat in loopback
    let clicks: number[] = [];
    /** A tap (or a click heard), as heard: kept, and reported against its click (the nearest one if not known). */
    const tap = (heardAt: number, knownClick?: number) => {
      // Nothing to measure before the first click or after the last one (a noise, a late key)
      if (clicks.length === 0 || heardAt < clicks[0] - interval / 2 || heardAt > clicks[clicks.length - 1] + interval / 2) return;
      taps.push(heardAt);
      if (!onTap) return;
      const click = knownClick ?? Math.max(0, Math.min(clicks.length - 1, Math.round((heardAt - clicks[0]) / interval)));
      const ms = Math.round((heardAt - clicks[click]) * 1000);
      onTap({ click, ms, measured: click >= warmup && Math.abs(ms) < interval * 500 });
    };
    let stopListening: () => void | Promise<void>;
    if (mode === 'midi') {
      stopListening = this.midiService.addNoteListener((event) => {
        if (event.type === 'down') tap(this.heardContextTime(event.timeStamp));
      });
    } else {
      // Before the clicks are scheduled: the browser may ask for the microphone first. A sound captured at context
      // time t was heard at t - the input latency, which the app takes for context time t - input latency - output
      // latency (as heardContextTime() does for a key press).
      // The microphone is recorded during the clicks, then each click is looked for in the recording. A click
      // played at context time c and captured at t went out, was heard, and came back in: t - c is the real output
      // latency plus the input latency. What the scoring believes is heard lags the context time by the browser's
      // reported output latency, measured here the way heardContextTime() sees it, so that the correction is in
      // the scoring's own terms: (t - input latency - that lag) - c, positive when the sound is heard later than
      // the browser says.
      const recorder = await this.microphone.record(context);
      const lags: number[] = [];
      const sampleLag = setInterval(() => lags.push(this.getContextTimeLag()), 50);
      stopListening = async () => {
        clearInterval(sampleLag);
        const recording = await recorder.stop();
        if (signal?.aborted) return;
        // currentTime moves by whole buffers: the median of the samples
        const lag = lags.length > 0 ? lags.sort((a, b) => a - b)[lags.length >> 1] : this.outputLatency();
        for (const onset of findClickOnsets(recording, clicks)) {
          if (onset.time !== null) tap(onset.time - recorder.inputLatency - lag, onset.click);
        }
      };
    }
    const first = context.currentTime + (mode === 'loopback' ? CALIBRATION_MIC_LEAD_S : CALIBRATION_LEAD_S);
    clicks = Array.from({ length: CALIBRATION_CLICKS }, (_, i) => first + i * interval);
    clicks.forEach((time, i) => this.playMetronomeClick(i % 4 === 0, METRONOME_FULL_VELOCITY, time));
    try {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const done = setTimeout(resolve, (clicks[clicks.length - 1] + interval - context.currentTime) * 1000);
        signal?.addEventListener('abort', () => {
          clearTimeout(done);
          reject(signal.reason);
        }, { once: true });
      });
    } finally {
      await stopListening();
    }
    const ms = calibrationOffsetMs(clicks, taps, interval, warmup);
    if (ms !== null) {
      this.setLatencyCalibration(ms);
    }
    return ms;
  }

  getTransportSeconds(): number {
    return this.transport().seconds;
  }

  /**
   * Loads the Spessasynth soundfont once per app session. Safe to call early (e.g. when the work page
   * opens, before any user gesture): the AudioContext is created suspended and only resumed by start().
   * Concurrent and later calls share the same load; a failed load can be retried.
   */
  initSoundFont(): Promise<void> {
    if (!this.initSoundFontPromise) {
      this.soundFontState.set('loading'); // first load, or a retry after an error
      this.initSoundFontPromise = this.loadSoundFont().then(() => {
        this.soundFontState.set('ready'); // the synth is exposed and can play notes
      }, (error) => {
        this.initSoundFontPromise = undefined;
        this.soundFontState.set('error');
        throw error;
      });
    }
    return this.initSoundFontPromise;
  }

  private async loadSoundFont(): Promise<void> {
    this.ensureTone(); // creates the page's AudioContext, Tone's clock too
    const audioContext = this.audioContext!;

    // Use AbortController to cancel fetch if service is destroyed
    this.soundFontAbortController = new AbortController();
    // The worklet module and the ~10 MB soundfont download in parallel
    const [, sfont] = await Promise.all([
      audioContext.audioWorklet.addModule(SOUNDFONT_WORKLET_URL),
      // From the Cache API after the first visit (or after a prefetch from the score page)
      loadSoundFontFile(this.soundFontAbortController.signal)
    ]);

    const synth = new WorkletSynthesizer(audioContext);
    synth.connect(audioContext.destination);
    await synth.soundBankManager.addSoundBank(sfont, "main");
    await synth.isReady;
    // Only expose the synth once it can actually play notes
    this.spessasynth = synth;
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
    const transport = this.transport();
    const roundedVelocity = Math.round(note.velocity * 84); // * 127 * 0.66 to reduce volume 

    // Note on
    transport.schedule((time: number) => {
      this.noteOn(channel, note.midi, roundedVelocity, time);
    }, noteStart + offset);

    // Note off
    transport.schedule((time: number) => {
      this.noteOff(channel, note.midi, time);
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
      this.pending.push({
        time: noteTime - startTime + offset,
        schedule: () => this.scheduleAccompanimentNote(channel, note, startTime, timeFactor, offset),
      });
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
    const transport = this.transport();
    const draw = this.draw();
    transport.cancel();
    draw.cancel();
    this.pending = [];
    this.nextPending = 0;
  }

  /**
   * Puts the tracks' notes (queued by scheduleHandTrack / scheduleAccompanimentTrack) on the transport as it
   * plays: those due within SCHEDULE_AHEAD_S of where it (re)starts now, the next ones every SCHEDULE_REFILL_S.
   * Notes before where it resumes after a Pause are skipped, beyond GOOD_RANGE: they will never play.
   */
  startRollingSchedule(): void {
    const transport = this.transport();
    this.pending.sort((a, b) => a.time - b.time); // stable: a chord keeps its order
    const from = transport.seconds;
    while (this.nextPending < this.pending.length && this.pending[this.nextPending].time < from - GOOD_RANGE) {
      this.nextPending++;
    }
    this.scheduleUpTo(from + SCHEDULE_AHEAD_S);
    if (this.nextPending < this.pending.length) {
      transport.scheduleRepeat(() => this.scheduleUpTo(transport.seconds + SCHEDULE_AHEAD_S), SCHEDULE_REFILL_S, from);
    }
  }

  private scheduleUpTo(horizon: number): void {
    for (; this.nextPending < this.pending.length && this.pending[this.nextPending].time < horizon; this.nextPending++) {
      this.pending[this.nextPending].schedule();
    }
  }

  /**
   * Démarre le transport
   */
  async start(): Promise<void> {
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.pianoMLShouldPlay = this.midiService.pianoMLShouldPlay();
    this.firstSoundPending = isDevMode();

    this.startPromise = (async () => {
      // Resolves at once when the page already preloaded the soundfont, waits for it otherwise
      await this.initSoundFont();

      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
      }

      const transport = this.transport();
      await this.ngZone.runOutsideAngular(() => Tone.start());
      if (transport.state !== 'started') {
        this.ngZone.runOutsideAngular(() => transport.start());
      }
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
    }
  }

  /**
   * Restarts a paused transport at once, synchronously, when everything is already running (the wait-mode case:
   * the user just played the awaited note). False when start() is needed: first play, suspended context, sounds
   * not loaded.
   */
  resumeNow(): boolean {
    const transport = this.transport();
    if (!this.spessasynth || this.audioContext?.state !== 'running' || transport.state !== 'paused') {
      return false;
    }
    this.ngZone.runOutsideAngular(() => transport.start());
    return true;
  }

  /**
   * Met en pause le transport
   */
  pause(): void {
    this.spessasynth?.stopAll();
    // stopAll() does not touch the notes queued in the synth for the next lookahead: they would sound after the
    // pause, and their note-offs, still on the transport, would wait for the resume. All Sound Off, queued at the
    // time of the last of them (after them: the synth's queue keeps the order of equal times), cuts them at once.
    const now = this.audioContext?.currentTime ?? 0;
    if (this.spessasynth && this.lastQueuedNoteOn > now) {
      for (let channel = 0; channel < MIDI_CHANNELS; channel++) {
        this.spessasynth.controllerChange(channel, ALL_SOUND_OFF, 0, { time: this.lastQueuedNoteOn });
      }
    }
    this.transport().pause();
  }

  /**
   * Arrête et réinitialise le transport
   */
  stop(): void {
    const transport = this.transport();
    const draw = this.draw();
    transport.stop();
    transport.position = 0;
    this.clearSchedule();

    // Cancel draw
    draw.dispose();
    draw.cancel();
  }

  resetSession(): void {
    this.stop();
    this.pianoMLShouldPlay = false;
    this.spessasynth?.stopAll(true); // queued clicks and notes too
  }

  /**
   * Schedule la fin de la lecture
   */
  scheduleEnd(endTime: number, onEndCallback: () => void): void {
    this.transport().schedule(() => {
      this.spessasynth?.stopAll();
      onEndCallback();
    }, endTime);
  }

  /**
   * Obtient le temps actuel du transport
   */
  getCurrentTime(): number {
    return this.transport().seconds;
  }

  /**
   * Vérifie si le transport est en cours de lecture
   */
  isPlaying(): boolean {
    return this.transport().state === 'started';
  }

  /**
   * Schedule une callback à un temps donné
   */
  schedule(callback: (time: number) => void, time: number): void {
    this.transport().schedule(callback, time);
  }

  /**
   * Schedule dans le contexte de dessin (pour les updates UI)
   */
  scheduleDraw(callback: () => void, time: number): void {
    // When the sound is heard, not when it is rendered: the cursor and the keys no longer run ahead of it
    this.draw().schedule(callback, time + this.outputLatency());
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

    // Every event is shifted by the count-in, awaited notes included: playback must reach the first one after
    // the clicks, with the other hand and the accompaniment in step
    const scheduleStartTime = noteTimeStart + offset;
    const scheduleEndTime = noteTimeEnd + offset;

    // Play-along: the user may play along any note of the keyboard's range, assessed by its due time
    if (!playConfig.waitForLeftHand && !playConfig.waitForRightHand
      && note.midi >= this.state.leftmostKey && note.midi <= this.state.rightmostKey) {
      this.assess.expectTimed(scheduleStartTime, note, hand);
    }
    
    const transport = this.transport();
    const roundedVelocity = Math.round(note.velocity * 127);

    // Note start: one transport event for the sound, the assessment and the pause decision. They run here, not in
    // a Tone.Draw callback, which Draw drops when it is more than its expiration late: a wait-mode expectation
    // must never be lost. The callback schedules the visual work (cursor, key lights) on Draw itself.
    transport.schedule((time: number) => {
      if (!isHandAwaited) {
        this.midiService.pressOutput(note.midi, note.velocity, this.contextToPerformanceMs(time));
        if (this.pianoMLShouldPlay) {
          this.noteOn(0, note.midi, roundedVelocity, time);
        }
      }
      const liveStatus = isHandAwaited
        ? this.assess.learnExpectation(this.getCurrentTime(), scheduleEndTime, note, hand)
        : this.assess.getExpectation();
      callbacks.onNoteStart(time, note, liveStatus);
    }, scheduleStartTime);

    // Note end (piano audio stop; the callback turns the key light off)
    transport.schedule((time: number) => {
      if (!isHandAwaited) {
        this.midiService.releaseOutput(note.midi, this.contextToPerformanceMs(time));
        if (this.pianoMLShouldPlay) {
          this.noteOff(0, note.midi, time);
        }
      }
      callbacks.onNoteEnd(time, note, this.assess.getExpectation());
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
      this.pending.push({
        time: noteTime - startTime + offset,
        schedule: () => this.scheduleHandNote(hand, note, startTime, timeFactor, offset, callbacks),
      });
    }
  }


  /**
   * A click at audio context `time` (now if omitted). Its note-off is queued in the synth and in the MIDI output
   * too: no timer on the main thread.
   */
  playMetronomeClick(isStrong: boolean, velocity: number = METRONOME_VELOCITY, time?: number): void {
    const note = isStrong ? 34 : 33;   // 34 = Metronome Bell, 33 = Metronome Click
    const at = time ?? this.audioContext?.currentTime ?? 0;
    this.noteOn(9, note, velocity, at);
    this.noteOff(9, note, at + METRONOME_CLICK_S);
    const atMs = this.contextToPerformanceMs(at);
    this.midiService.pressDrum(note, velocity / 127, atMs);
    this.midiService.releaseDrum(note, atMs + METRONOME_CLICK_S * 1000);
  }


  /**
   * Décompte de mesure précis avant le départ, basé sur Tone.Transport
   */
  startCountIn(bar: number, timeSigEvent: TimeSignatureEvent, bpm: number): number {
    let offset = 0;
    const [numerator, denominator] = timeSigEvent?.timeSignature || [4, 4];

    const beatDurationMs = (60000 / bpm);
    const beatUnitFactor = 4 / denominator;
    const measureDurationSeconds = numerator * beatUnitFactor * beatDurationMs / 1000;

    let beatsPerBar = numerator;
    if (denominator > 8) {
      // Try to normalize meter to an equivalent x/4 pulse grid.
      // Example: 12/16 -> 3/4, 6/8 -> 3/4.
      const quarterBasedNumerator = (numerator * 4) / denominator;
      if (Number.isInteger(quarterBasedNumerator) && quarterBasedNumerator > 0) {
        beatsPerBar = quarterBasedNumerator;
      } else if ((denominator === 8 || denominator === 16) && numerator % 3 === 0) {
        // Fallback for compound meters that cannot be represented as an integer x/4.
        beatsPerBar = numerator / 3;
      }
    }

    const stepSeconds = measureDurationSeconds / beatsPerBar;

    // Cache transport to avoid repeated accessor calls in loop
    const transport = this.transport();

    const totalCountInBeats = beatsPerBar * bar;
    for (let i = 0; i < totalCountInBeats; i++) {
      offset = i * stepSeconds;

      transport.scheduleOnce((time: number) => {
        this.playMetronomeClick(i % beatsPerBar === 0, METRONOME_FULL_VELOCITY, time);
      }, `${i * stepSeconds}`);
    }

    offset = totalCountInBeats * stepSeconds;
    // metronome all allong
    if (this.state.playConfiguration.useMetronome) {
      let beatInBar = 0;
      transport.scheduleRepeat((time: number) => {
        const currentBeat = beatInBar;
        beatInBar = (beatInBar + 1) % beatsPerBar;
        this.playMetronomeClick(currentBeat === 0, METRONOME_VELOCITY, time);
      }, stepSeconds, offset);
    }
    return offset;
  }

  ngOnDestroy(): void {
    // Cancel any ongoing fetch requests
    if (this.soundFontAbortController) {
      this.soundFontAbortController.abort();
      this.soundFontAbortController = undefined;
    }

    // Stop transport and clear all schedules
    try {
      const transport = this.transport();
      if (transport.state === 'started' || transport.state === 'paused') {
        transport.stop();
        transport.position = 0;
      }
      this.clearSchedule();
      // Note: Do NOT call draw.dispose() as Tone.Draw is a global singleton
      // shared with other services. Only cancel pending draws.
      const draw = this.draw();
      draw.cancel();
    } catch (e) {
      // Tone may be disposed
    }

    // Dispose WorkletSynthesizer
    if (this.spessasynth) {
      this.spessasynth.stopAll();
      this.spessasynth = undefined;
    }
    this.initSoundFontPromise = undefined;

    // Suspend the page's AudioContext (not closed: Tone's global context uses it, and a next instance resumes it)
    if (this.audioContext) {
      if (this.audioContext.state === 'running') {
        this.audioContext.suspend().catch(() => {
          // Context already closed or suspended
        });
      }
      this.audioContext = undefined;
    }
  }

}
