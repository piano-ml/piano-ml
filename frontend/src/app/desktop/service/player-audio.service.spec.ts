import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type * as Midi from '@tonejs/midi';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import type { Note } from '@tonejs/midi/dist/Note';
import * as Tone from 'tone';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { PlayConfiguration } from '../model/model';
import { PlayerAssessService } from './player-assess.service';
import { METRONOME_CLICK_S, PLAYBACK_LOOKAHEAD_S, PlayerAudioService, isCompleteRiff } from './player-audio.service';
import { PlayerStateService } from './player-state.service';

/**
 * Everything scheduled on Tone's transport (and draw queue) is captured with its time instead of being
 * played, so tests can check what would sound when, then run the callbacks in time order.
 */
function captureSchedule() {
  const events: { time: number; fn: (time: number) => void; kind: string }[] = [];
  const transport = Tone.getTransport();
  const draw = Tone.getDraw();
  const record = (kind: string) => (fn: (time: number) => void, time: unknown) => {
    events.push({ time: Number(time), fn, kind });
    return events.length;
  };
  vi.spyOn(transport, 'schedule').mockImplementation(record('schedule') as never);
  vi.spyOn(transport, 'scheduleOnce').mockImplementation(record('once') as never);
  vi.spyOn(transport, 'scheduleRepeat').mockImplementation(((fn: (t: number) => void, interval: unknown, start: unknown) => {
    events.push({ time: Number(start), fn, kind: `repeat every ${interval}` });
    return events.length;
  }) as never);
  // draw callbacks run as soon as their transport callback does
  vi.spyOn(draw, 'schedule').mockImplementation(((fn: () => void) => { fn(); return draw; }) as never);
  return {
    events,
    times: (kind = 'schedule') => events.filter((e) => e.kind === kind).map((e) => e.time),
    /** Runs every captured transport callback in time order. */
    runAll() {
      for (const e of [...events].sort((a, b) => a.time - b.time)) e.fn(e.time);
    },
  };
}

const note = (overrides: Partial<Note>) => ({ midi: 60, time: 1, duration: 0.5, velocity: 1, ticks: 480, ...overrides }) as Note;
const track = (notes: Note[], channel = 0, instrument = 0) => ({ notes, channel, instrument: { number: instrument } }) as unknown as Midi.Track;

describe('PlayerAudioService', () => {
  let audio: PlayerAudioService;
  let state: PlayerStateService;
  let synth: { noteOn: ReturnType<typeof vi.fn>; noteOff: ReturnType<typeof vi.fn>; stopAll: ReturnType<typeof vi.fn>; programChange: ReturnType<typeof vi.fn>; controllerChange: ReturnType<typeof vi.fn> };
  type Fn = ReturnType<typeof vi.fn>;
  let midi: { pressOutput: Fn; releaseOutput: Fn; pressDrum: Fn; releaseDrum: Fn; pianoMLShouldPlay: Fn };
  let assess: { learnExpectation: ReturnType<typeof vi.fn>; getExpectation: ReturnType<typeof vi.fn>; expectTimed: ReturnType<typeof vi.fn> };
  let schedule: ReturnType<typeof captureSchedule>;

  beforeEach(() => {
    midi = { pressOutput: vi.fn(), releaseOutput: vi.fn(), pressDrum: vi.fn(), releaseDrum: vi.fn(), pianoMLShouldPlay: vi.fn(() => true) };
    assess = { learnExpectation: vi.fn(() => ({ shouldPause: true })), getExpectation: vi.fn(() => ({ shouldPause: false })), expectTimed: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: MidiServiceService, useValue: midi }, { provide: PlayerAssessService, useValue: assess }],
    });
    audio = TestBed.inject(PlayerAudioService);
    state = TestBed.inject(PlayerStateService);
    state.playConfiguration = { waitForRightHand: false, waitForLeftHand: false, useMetronome: false } as PlayConfiguration;
    synth = { noteOn: vi.fn(), noteOff: vi.fn(), stopAll: vi.fn(), programChange: vi.fn(), controllerChange: vi.fn() };
    audio.spessasynth = synth as never;
    audio.isPlaying(); // Tone now runs on the page's AudioContext: capture that context's transport
    schedule = captureSchedule();
  });

  describe('accompaniment', () => {
    it('schedules note on and off, scaled by the tempo factor and shifted by the count-in', () => {
      audio.scheduleAccompanimentNote(3, note({ time: 2, duration: 1, velocity: 0.5 }), 0, 0.5, 4);
      expect(schedule.times()).toEqual([1 + 4, 1.5 + 4]);
      schedule.runAll();
      // at the times Tone scheduled them, velocity scaled to 2/3 of 127
      expect(synth.noteOn).toHaveBeenCalledWith(3, 60, 42, { time: 5 });
      expect(synth.noteOff).toHaveBeenCalledWith(3, 60, { time: 5.5 });
    });

    it('starts relative to the playback start, and skips earlier notes and rests', () => {
      audio.scheduleAccompanimentNote(3, note({ time: 5 }), 4, 1, 0);
      audio.scheduleAccompanimentNote(3, note({ time: 3 }), 4, 1, 0); // before the start
      audio.scheduleAccompanimentNote(3, note({ time: 6, midi: 0 }), 4, 1, 0); // rest
      expect(schedule.times()).toEqual([1, 1.5]);
    });

    it('a track only schedules the notes of the playback window', () => {
      audio.scheduleAccompanimentTrack(2, track([note({ time: 0 }), note({ time: 1 }), note({ time: 2 }), note({ time: 3 })]), 1, 3, 1, 0);
      expect(schedule.times()).toEqual([0, 0.5, 1, 1.5]); // notes at 1 and 2, relative to the start
    });

    it('plays each track on its own channel with its instrument, away from the piano channels', () => {
      const file = { tracks: [track([note({ time: 0 })], 0, 24), track([note({ time: 0 })], 1, 40)] } as unknown as Midi.Midi;
      audio.scheduleAccompanimentTracks(file, 0, 10, 1, 0);
      expect(synth.programChange.mock.calls).toEqual([[2, 24], [3, 40]]);
      schedule.runAll();
      expect(synth.noteOn.mock.calls.map(([channel]) => channel)).toEqual([2, 3]);
    });
  });

  describe('hand notes', () => {
    const callbacks = () => ({ onNoteStart: vi.fn(), onNoteEnd: vi.fn() });

    it('plays a hand the user does not play, shifted by the count-in', () => {
      audio.pianoMLShouldPlay = true;
      const cb = callbacks();
      audio.scheduleHandNote('rh', note({ time: 1, duration: 0.5, velocity: 0.5 }), 0, 1, 2, cb);
      expect(schedule.times()).toEqual([3, 3.5]); // one transport event for the note start, one for its end
      schedule.runAll();
      expect(midi.pressOutput).toHaveBeenCalledWith(60, 0.5, expect.any(Number));
      expect(synth.noteOn).toHaveBeenCalledWith(0, 60, 64, { time: 3 }); // sample-accurate: at its scheduled time
      expect(midi.releaseOutput).toHaveBeenCalledWith(60, expect.any(Number));
      expect(synth.noteOff).toHaveBeenCalledWith(0, 60, { time: 3.5 });
      expect(cb.onNoteStart).toHaveBeenCalledWith(3, expect.objectContaining({ midi: 60 }), { shouldPause: false });
      expect(cb.onNoteEnd).toHaveBeenCalledOnce();
    });

    it('in play-along mode, expects the user may play each note of the keyboard range at its due time', () => {
      state.leftmostKey = 36;
      state.rightmostKey = 96;
      audio.scheduleHandNote('rh', note({ time: 1, midi: 72 }), 0, 1, 2, callbacks());
      audio.scheduleHandNote('lh', note({ time: 1, midi: 30 }), 0, 1, 2, callbacks()); // off the keyboard
      expect(assess.expectTimed.mock.calls).toEqual([[3, expect.objectContaining({ midi: 72 }), 'rh']]);
    });

    it('expects nothing by time once a hand is awaited', () => {
      state.leftmostKey = 36;
      state.rightmostKey = 96;
      state.playConfiguration.waitForLeftHand = true;
      audio.scheduleHandNote('rh', note({ time: 1, midi: 72 }), 0, 1, 2, callbacks()); // the hand played by the app
      expect(assess.expectTimed).not.toHaveBeenCalled();
    });

    it('sends it to the MIDI output only when PianoML should not play itself', () => {
      audio.pianoMLShouldPlay = false;
      audio.scheduleHandNote('rh', note({}), 0, 1, 0, callbacks());
      schedule.runAll();
      expect(midi.pressOutput).toHaveBeenCalled();
      expect(synth.noteOn).not.toHaveBeenCalled();
    });

    it('waits for the user on an awaited hand after the count-in: no sound, an expectation instead', () => {
      state.playConfiguration.waitForRightHand = true;
      audio.pianoMLShouldPlay = true;
      const cb = callbacks();
      audio.scheduleHandNote('rh', note({ time: 1, duration: 0.5 }), 0, 1, 2, cb);
      expect(new Set(schedule.times())).toEqual(new Set([3, 3.5])); // shifted by the count-in, like everything else
      schedule.runAll();
      expect(synth.noteOn).not.toHaveBeenCalled();
      expect(midi.pressOutput).not.toHaveBeenCalled();
      expect(assess.learnExpectation).toHaveBeenCalledWith(expect.any(Number), 3.5, expect.objectContaining({ midi: 60 }), 'rh');
      expect(cb.onNoteStart).toHaveBeenCalledWith(3, expect.anything(), { shouldPause: true });
    });

    it('learns a wait-mode expectation in the transport callback: Tone.Draw cannot drop it', () => {
      state.playConfiguration.waitForRightHand = true;
      vi.mocked(Tone.getDraw().schedule).mockImplementation((() => Tone.getDraw()) as never); // frames never come
      const cb = callbacks();
      audio.scheduleHandNote('rh', note({ time: 1, duration: 0.5 }), 0, 1, 2, cb);
      expect(schedule.times()).toHaveLength(2);
      schedule.runAll();
      expect(assess.learnExpectation).toHaveBeenCalledOnce();
      expect(cb.onNoteStart).toHaveBeenCalledWith(3, expect.anything(), { shouldPause: true });
    });

    it('keeps the awaited hand in step with the hand the app plays', () => {
      state.playConfiguration.waitForRightHand = true;
      audio.scheduleHandNote('rh', note({ time: 1, duration: 0.5 }), 0, 1, 2, callbacks()); // awaited
      const awaited = schedule.times();
      schedule = captureSchedule();
      audio.scheduleHandNote('lh', note({ time: 1, duration: 0.5 }), 0, 1, 2, callbacks()); // played by the app
      expect(new Set(schedule.times())).toEqual(new Set(awaited));
    });

    it('plays awaited-hand notes outside the keyboard range itself', () => {
      state.playConfiguration.waitForLeftHand = true;
      state.leftmostKey = 36;
      audio.pianoMLShouldPlay = true;
      audio.scheduleHandNote('lh', note({ midi: 30 }), 0, 1, 0, callbacks());
      schedule.runAll();
      expect(synth.noteOn).toHaveBeenCalledWith(0, 30, 127, { time: 1 });
      expect(assess.learnExpectation).not.toHaveBeenCalled();
    });

    it('a hand track only schedules the notes of the playback window', () => {
      const spy = vi.spyOn(audio, 'scheduleHandNote');
      audio.scheduleHandTrack('lh', track([note({ time: 0 }), note({ time: 2 }), note({ time: 4 })]), 1, 4, 0, 1, callbacks());
      expect(spy.mock.calls.map(([, n]) => n.time)).toEqual([2]);
    });
  });

  describe('metronome', () => {
    it('clicks on the drum channel, accented on the first beat, for METRONOME_CLICK_S, all queued at once', () => {
      audio.playMetronomeClick(true, 43, 10);
      audio.playMetronomeClick(false, 43, 10.5);
      expect(synth.noteOn.mock.calls).toEqual([[9, 34, 43, { time: 10 }], [9, 33, 43, { time: 10.5 }]]);
      expect(synth.noteOff.mock.calls).toEqual([[9, 34, { time: 10 + METRONOME_CLICK_S }], [9, 33, { time: 10.5 + METRONOME_CLICK_S }]]);
      const [[, , pressAt]] = midi.pressDrum.mock.calls;
      expect(midi.pressDrum).toHaveBeenCalledWith(34, 43 / 127, expect.any(Number));
      expect(midi.releaseDrum.mock.calls[0]).toEqual([34, pressAt + METRONOME_CLICK_S * 1000]); // no timer: timestamped
    });

    it.each([
      [[4, 4], 120, 8, 0.5, 4],
      [[3, 4], 60, 6, 1, 6],
      [[6, 8], 120, 12, 0.25, 3], // eighth-note beats
      [[12, 16], 120, 6, 0.5, 3], // normalized to 3/4 pulses
    ])('counts two bars of %j at %i BPM: %i clicks every %ss, playback after %ss', (sig, bpm, clicks, step, startsAt) => {
      const offset = audio.startCountIn(2, { timeSignature: sig } as TimeSignatureEvent, bpm);
      const times = schedule.times('once');
      expect(times).toHaveLength(clicks);
      expect(times[1] - times[0]).toBeCloseTo(step);
      expect(offset).toBeCloseTo(startsAt);
    });

    it('accents the first beat of each count-in bar', () => {
      const click = vi.spyOn(audio, 'playMetronomeClick').mockImplementation(() => undefined);
      audio.startCountIn(2, { timeSignature: [3, 4] } as TimeSignatureEvent, 120);
      schedule.runAll();
      expect(click.mock.calls.map(([strong]) => strong)).toEqual([true, false, false, true, false, false]);
    });

    it('keeps clicking during playback when the metronome is on', () => {
      state.playConfiguration.useMetronome = true;
      const click = vi.spyOn(audio, 'playMetronomeClick').mockImplementation(() => undefined);
      audio.startCountIn(1, { timeSignature: [2, 4] } as TimeSignatureEvent, 120);
      const repeat = schedule.events.find((e) => e.kind.startsWith('repeat'))!;
      expect(repeat.kind).toBe('repeat every 0.5');
      expect(repeat.time).toBe(1);
      repeat.fn(0); repeat.fn(0); repeat.fn(0);
      expect(click.mock.calls.slice(-3).map(([strong]) => strong)).toEqual([true, false, true]);
    });

    it('defaults to 4/4 without a time signature', () => {
      expect(audio.startCountIn(1, undefined as unknown as TimeSignatureEvent, 60)).toBeCloseTo(4);
    });
  });

  describe('transport', () => {
    it('schedules the end of playback, silencing everything', () => {
      const onEnd = vi.fn();
      audio.scheduleEnd(12, onEnd);
      expect(schedule.times()).toEqual([12]);
      schedule.runAll();
      expect(synth.stopAll).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('pause silences the synth and pauses the transport', () => {
      const pause = vi.spyOn(Tone.getTransport(), 'pause').mockReturnValue(Tone.getTransport());
      audio.pause();
      expect(synth.stopAll).toHaveBeenCalled();
      expect(pause).toHaveBeenCalled();
    });

    it('stop rewinds and clears everything scheduled', () => {
      const cancel = vi.spyOn(Tone.getTransport(), 'cancel');
      audio.stop();
      expect(cancel).toHaveBeenCalled();
      expect(Tone.getTransport().position).toBe('0:0:0');
    });

    it('pause cuts the notes already queued in the synth for after it, on every channel', () => {
      vi.spyOn(Tone.getTransport(), 'pause').mockReturnValue(Tone.getTransport());
      const later = Tone.getContext().currentTime + 10;
      audio.playMetronomeClick(true, 43, later); // queued: would sound after the pause
      audio.pause();
      expect(synth.controllerChange).toHaveBeenCalledTimes(16);
      expect(synth.controllerChange).toHaveBeenCalledWith(9, 120, 0, { time: later }); // All Sound Off, after it
    });

    it('pause has nothing to cut when nothing is queued ahead', () => {
      vi.spyOn(Tone.getTransport(), 'pause').mockReturnValue(Tone.getTransport());
      audio.pause();
      expect(synth.controllerChange).not.toHaveBeenCalled();
    });

    it('resetSession stops and forgets the PianoML output choice', () => {
      audio.pianoMLShouldPlay = true;
      audio.resetSession();
      expect(audio.pianoMLShouldPlay).toBe(false);
      expect(synth.stopAll).toHaveBeenCalled();
    });

    it('exposes the transport clock and state', () => {
      expect(audio.isPlaying()).toBe(false);
      expect(audio.getCurrentTime()).toBe(Tone.getTransport().seconds);
      expect(audio.getTransportSeconds()).toBe(Tone.getTransport().seconds);
    });

    it('schedule / scheduleDraw forward to the transport and the draw queue', () => {
      const fn = vi.fn();
      audio.schedule(fn, 3);
      expect(schedule.times()).toEqual([3]);
      audio.scheduleDraw(fn, 3);
      expect(fn).toHaveBeenCalledOnce(); // draw callbacks run immediately in these tests
    });
    // start() needs a running AudioContext (a user gesture): covered by the acceptance workbench scenario
  });

  it(`schedules PLAYBACK_LOOKAHEAD_S ahead, with Tone's context created outside the Angular zone`, () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: MidiServiceService, useValue: midi }, { provide: PlayerAssessService, useValue: assess }],
    });
    const outside = vi.spyOn(TestBed.inject(NgZone), 'runOutsideAngular');
    const fresh = TestBed.inject(PlayerAudioService);
    fresh.isPlaying();
    expect(outside).toHaveBeenCalled();
    expect(Tone.getContext().lookAhead).toBe(PLAYBACK_LOOKAHEAD_S);
  });

  describe('latency', () => {
    const context = () => (audio as unknown as { audioContext: AudioContext }).audioContext;

    it('maps a performance time to the context time heard then, with the output timestamp', () => {
      vi.spyOn(context(), 'getOutputTimestamp').mockReturnValue({ contextTime: 5, performanceTime: 1000 });
      expect(audio.heardContextTime(1250)).toBeCloseTo(5.25);
      expect(audio.contextToPerformanceMs(5.5)).toBeCloseTo(performance.now() + (5.5 - audio.heardContextTime()) * 1000, 0);
    });

    it('without an output timestamp, takes the reported output latency off the current time', () => {
      vi.spyOn(context(), 'getOutputTimestamp').mockReturnValue({ contextTime: 0, performanceTime: 0 });
      vi.spyOn(context(), 'outputLatency', 'get').mockReturnValue(0.2);
      const now = performance.now();
      expect(audio.heardContextTime(now)).toBeCloseTo(context().currentTime - 0.2, 1);
    });

    it('scores keys against the score position heard, less the calibration correction', () => {
      vi.spyOn(context(), 'getOutputTimestamp').mockReturnValue({ contextTime: 5, performanceTime: 1000 });
      const at = vi.spyOn(Tone.getTransport(), 'getSecondsAtTime').mockImplementation((t) => Number(t));
      audio.setLatencyCalibration(100);
      expect(audio.heardTransportSeconds(1000)).toBeCloseTo(4.9);
      expect(at).toHaveBeenCalledWith(expect.closeTo(4.9, 5));
      audio.setLatencyCalibration(0);
    });

    it('draws the cursor and the keys when the sound is heard', () => {
      vi.spyOn(context(), 'outputLatency', 'get').mockReturnValue(0.15);
      const draw = vi.spyOn(Tone.getDraw(), 'schedule').mockReturnValue(Tone.getDraw());
      audio.scheduleDraw(() => undefined, 3);
      expect(draw).toHaveBeenCalledWith(expect.any(Function), 3.15);
    });

    it('calibrates from taps on the clicks it plays', async () => {
      vi.spyOn(audio, 'initSoundFont').mockResolvedValue();
      vi.spyOn(context(), 'resume').mockResolvedValue(); // no user gesture in tests
      let listener!: (e: { type: 'down'; note: number; time: number; timeStamp: number }) => void;
      (midi as unknown as { addNoteListener: unknown }).addNoteListener = vi.fn((l: typeof listener) => { listener = l; return () => undefined; });
      vi.spyOn(audio, 'playMetronomeClick').mockImplementation(() => undefined);
      // Each tap lands 70 ms after its click, as heard
      vi.spyOn(audio, 'heardContextTime').mockImplementation((perfMs?: number) => (perfMs ?? 0) / 1000);
      vi.useFakeTimers();
      const done = audio.calibrateLatency();
      await vi.advanceTimersByTimeAsync(0);
      const clicks = vi.mocked(audio.playMetronomeClick).mock.calls.map(([, , time]) => time!);
      expect(clicks).toHaveLength(12);
      for (const click of clicks) listener({ type: 'down', note: 60, time: 0, timeStamp: (click + 0.07) * 1000 });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await done).toBe(70);
      expect(audio.latencyCalibrationMs()).toBe(70);
      vi.useRealTimers();
      audio.setLatencyCalibration(0);
    });
  });

  describe('sounds loading state', () => {
    const loader = () => vi.spyOn(audio as unknown as { loadSoundFont(): Promise<void> }, 'loadSoundFont');

    it("is 'loading', then 'ready' once the synth can play", async () => {
      let loaded!: () => void;
      loader().mockReturnValue(new Promise<void>((resolve) => { loaded = resolve; }));
      const init = audio.initSoundFont();
      expect(audio.soundFontState()).toBe('loading');
      loaded();
      await init;
      expect(audio.soundFontState()).toBe('ready');
    });

    it("is 'error' when loading fails, and 'loading' again on a retry", async () => {
      const load = loader().mockRejectedValueOnce(new Error('offline'));
      await expect(audio.initSoundFont()).rejects.toThrow('offline');
      expect(audio.soundFontState()).toBe('error');
      load.mockReturnValue(new Promise<void>(() => undefined));
      void audio.initSoundFont();
      expect(audio.soundFontState()).toBe('loading');
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  it('cleans up when destroyed', () => {
    audio.ngOnDestroy();
    expect(synth.stopAll).toHaveBeenCalled();
    expect(audio.spessasynth).toBeUndefined();
  });

  it('runs Tone on the same AudioContext as the synth: one clock', () => {
    expect(Tone.getContext().rawContext).toBe((audio as unknown as { audioContext: AudioContext }).audioContext);
  });
});

describe('isCompleteRiff', () => {
  /** A RIFF file whose header declares `declared` payload bytes, cut to `actual` total bytes. */
  function riff(declared: number, actual: number): ArrayBuffer {
    const buffer = new ArrayBuffer(actual);
    const view = new DataView(buffer);
    [0x52, 0x49, 0x46, 0x46].forEach((byte, i) => view.setUint8(i, byte));
    view.setUint32(4, declared, true);
    return buffer;
  }

  it('accepts a file as long as its header declares', () => {
    expect(isCompleteRiff(riff(100, 108))).toBe(true);
  });

  it('rejects a truncated file (e.g. a cut download kept in the HTTP cache)', () => {
    expect(isCompleteRiff(riff(100, 60))).toBe(false);
  });

  it('rejects an empty or non-RIFF buffer', () => {
    expect(isCompleteRiff(new ArrayBuffer(0))).toBe(false);
    expect(isCompleteRiff(new TextEncoder().encode('<!doctype html><html>').buffer as ArrayBuffer)).toBe(false);
  });
});
