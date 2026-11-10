import { TestBed } from '@angular/core/testing';
import type * as Midi from '@tonejs/midi';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import type { Note } from '@tonejs/midi/dist/Note';
import * as Tone from 'tone';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { PlayConfiguration } from '../model/model';
import { PlayerAssessService } from './player-assess.service';
import { PlayerAudioService } from './player-audio.service';
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
  let synth: { noteOn: ReturnType<typeof vi.fn>; noteOff: ReturnType<typeof vi.fn>; stopAll: ReturnType<typeof vi.fn>; programChange: ReturnType<typeof vi.fn> };
  type Fn = ReturnType<typeof vi.fn>;
  let midi: { pressOutput: Fn; releaseOutput: Fn; pressDrum: Fn; releaseDrum: Fn; pianoMLShouldPlay: Fn };
  let assess: { learnExpectation: ReturnType<typeof vi.fn>; getExpectation: ReturnType<typeof vi.fn> };
  let schedule: ReturnType<typeof captureSchedule>;

  beforeEach(() => {
    midi = { pressOutput: vi.fn(), releaseOutput: vi.fn(), pressDrum: vi.fn(), releaseDrum: vi.fn(), pianoMLShouldPlay: vi.fn(() => true) };
    assess = { learnExpectation: vi.fn(() => ({ shouldPause: true })), getExpectation: vi.fn(() => ({ shouldPause: false })) };
    TestBed.configureTestingModule({
      providers: [{ provide: MidiServiceService, useValue: midi }, { provide: PlayerAssessService, useValue: assess }],
    });
    audio = TestBed.inject(PlayerAudioService);
    state = TestBed.inject(PlayerStateService);
    state.playConfiguration = { waitForRightHand: false, waitForLeftHand: false, useMetronome: false } as PlayConfiguration;
    synth = { noteOn: vi.fn(), noteOff: vi.fn(), stopAll: vi.fn(), programChange: vi.fn() };
    audio.spessasynth = synth as never;
    schedule = captureSchedule();
  });

  describe('accompaniment', () => {
    it('schedules note on and off, scaled by the tempo factor and shifted by the count-in', () => {
      audio.scheduleAccompanimentNote(3, note({ time: 2, duration: 1, velocity: 0.5 }), 0, 0.5, 4);
      expect(schedule.times()).toEqual([1 + 4, 1.5 + 4]);
      schedule.runAll();
      expect(synth.noteOn).toHaveBeenCalledWith(3, 60, 42); // velocity scaled to 2/3 of 127
      expect(synth.noteOff).toHaveBeenCalledWith(3, 60);
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
      expect(new Set(schedule.times())).toEqual(new Set([3, 3.5]));
      schedule.runAll();
      expect(midi.pressOutput).toHaveBeenCalledWith(60, 0.5);
      expect(synth.noteOn).toHaveBeenCalledWith(0, 60, 64);
      expect(midi.releaseOutput).toHaveBeenCalledWith(60);
      expect(synth.noteOff).toHaveBeenCalledWith(0, 60);
      expect(cb.onNoteStart).toHaveBeenCalledWith(3, expect.objectContaining({ midi: 60 }), { shouldPause: false });
      expect(cb.onNoteEnd).toHaveBeenCalledOnce();
    });

    it('sends it to the MIDI output only when PianoML should not play itself', () => {
      audio.pianoMLShouldPlay = false;
      audio.scheduleHandNote('rh', note({}), 0, 1, 0, callbacks());
      schedule.runAll();
      expect(midi.pressOutput).toHaveBeenCalled();
      expect(synth.noteOn).not.toHaveBeenCalled();
    });

    it('waits for the user on an awaited hand: no sound, no count-in shift, an expectation instead', () => {
      state.playConfiguration.waitForRightHand = true;
      audio.pianoMLShouldPlay = true;
      const cb = callbacks();
      audio.scheduleHandNote('rh', note({ time: 1, duration: 0.5 }), 0, 1, 2, cb);
      expect(new Set(schedule.times())).toEqual(new Set([1, 1.5]));
      schedule.runAll();
      expect(synth.noteOn).not.toHaveBeenCalled();
      expect(midi.pressOutput).not.toHaveBeenCalled();
      expect(assess.learnExpectation).toHaveBeenCalledWith(expect.any(Number), 1.5, expect.objectContaining({ midi: 60 }), 'rh');
      expect(cb.onNoteStart).toHaveBeenCalledWith(1, expect.anything(), { shouldPause: true });
    });

    it('plays awaited-hand notes outside the keyboard range itself', () => {
      state.playConfiguration.waitForLeftHand = true;
      state.leftmostKey = 36;
      audio.pianoMLShouldPlay = true;
      audio.scheduleHandNote('lh', note({ midi: 30 }), 0, 1, 0, callbacks());
      schedule.runAll();
      expect(synth.noteOn).toHaveBeenCalledWith(0, 30, 127);
      expect(assess.learnExpectation).not.toHaveBeenCalled();
    });

    it('a hand track only schedules the notes of the playback window', () => {
      const spy = vi.spyOn(audio, 'scheduleHandNote');
      audio.scheduleHandTrack('lh', track([note({ time: 0 }), note({ time: 2 }), note({ time: 4 })]), 1, 4, 0, 1, callbacks());
      expect(spy.mock.calls.map(([, n]) => n.time)).toEqual([2]);
    });
  });

  describe('metronome', () => {
    it('clicks on the drum channel, accented on the first beat, for 40 ms', () => {
      vi.useFakeTimers();
      audio.playMetronomeClick(true);
      audio.playMetronomeClick(false);
      expect(synth.noteOn.mock.calls).toEqual([[9, 34, 43], [9, 33, 43]]);
      expect(midi.pressDrum).toHaveBeenCalledWith(34, 43 / 127);
      vi.advanceTimersByTime(40);
      expect(synth.noteOff.mock.calls).toEqual([[9, 34], [9, 33]]);
      expect(midi.releaseDrum).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
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

    it('stop rewinds and clears everything scheduled, including pending metronome clicks', () => {
      vi.useFakeTimers();
      audio.playMetronomeClick(true);
      const cancel = vi.spyOn(Tone.getTransport(), 'cancel');
      audio.stop();
      vi.advanceTimersByTime(100);
      expect(cancel).toHaveBeenCalled();
      expect(Tone.getTransport().position).toBe('0:0:0');
      expect(midi.releaseDrum).not.toHaveBeenCalled(); // the click's release timer was cleared
      vi.useRealTimers();
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

  it('cleans up when destroyed', () => {
    vi.useFakeTimers();
    audio.playMetronomeClick(false);
    audio.ngOnDestroy();
    vi.advanceTimersByTime(100);
    expect(midi.releaseDrum).not.toHaveBeenCalled();
    expect(audio.spessasynth).toBeUndefined();
    vi.useRealTimers();
  });
});
