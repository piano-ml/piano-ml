import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlayGuideService, type PlayGuideOutput } from './play-guide.service';
import { AudioMixerService, MIXER_BUSES, MIXER_STORAGE_KEY } from './audio-mixer.service';
import type * as Midi from '@tonejs/midi';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import type { Note } from '@tonejs/midi/dist/Note';
import * as Tone from 'tone';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { PlayConfiguration } from '../model/model';
import { MicrophoneService } from './microphone.service';
import { PlayerAssessService } from './player-assess.service';
import { METRONOME_CLICK_S, PLAYBACK_LOOKAHEAD_S, PlayerAudioService, SCHEDULE_AHEAD_S, SCHEDULE_REFILL_S, isCompleteRiff } from './player-audio.service';
import { withListenerParams } from './audio-listener';
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
    // Every bus at its full level: the velocities below are the score's own (the mixer is tested on its own)
    const fullMixer = TestBed.inject(AudioMixerService);
    MIXER_BUSES.forEach((bus) => fullMixer.setLevel(bus, 1));
    localStorage.removeItem(MIXER_STORAGE_KEY);
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
      audio.startRollingSchedule();
      expect(schedule.times()).toEqual([0, 0.5, 1, 1.5]); // notes at 1 and 2, relative to the start
    });

    it('plays each track on its own channel with its instrument, away from the piano channels', () => {
      const file = { tracks: [track([note({ time: 0 })], 0, 24), track([note({ time: 0 })], 1, 40)] } as unknown as Midi.Midi;
      audio.scheduleAccompanimentTracks(file, 0, 10, 1, 0);
      audio.startRollingSchedule();
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
      expect(midi.pressOutput).toHaveBeenCalledWith(60, 64 / 127, expect.any(Number)); // a whole MIDI velocity
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

    describe('play along (hand-mode.ts)', () => {
      let guide: { [K in keyof PlayGuideOutput]: ReturnType<typeof vi.fn> };

      beforeEach(() => {
        guide = { noteOn: vi.fn(), noteOff: vi.fn(), allOff: vi.fn() };
        TestBed.inject(PlayGuideService).register(guide as unknown as PlayGuideOutput);
        state.leftmostKey = 36;
        state.rightmostKey = 96;
        audio.pianoMLShouldPlay = true;
      });

      it('plays a hand played along with the student: sound, the guide, and an assessment by time', () => {
        state.playConfiguration.alongRightHand = true;
        audio.scheduleHandNote('rh', note({ time: 1, duration: 0.5, midi: 72, velocity: 0.5 }), 0, 1, 2, callbacks());
        schedule.runAll();
        expect(synth.noteOn).toHaveBeenCalledWith(0, 72, 64, { time: 3 });
        expect(midi.pressOutput).toHaveBeenCalledWith(72, 64 / 127, expect.any(Number));
        expect(midi.releaseOutput).toHaveBeenCalled();
        expect(guide.noteOn).toHaveBeenCalledWith(72, 0.5, 'rh', expect.any(Number));
        expect(guide.noteOff).toHaveBeenCalledWith(72, 'rh', expect.any(Number));
        expect(assess.expectTimed.mock.calls).toEqual([[3, expect.objectContaining({ midi: 72 }), 'rh']]);
        expect(assess.learnExpectation).not.toHaveBeenCalled();
      });

      it('plays the notes of a hand played along that the keyboard cannot reach', () => {
        state.playConfiguration.alongLeftHand = true;
        audio.scheduleHandNote('lh', note({ midi: 30 }), 0, 1, 0, callbacks());
        schedule.runAll();
        expect(synth.noteOn).toHaveBeenCalledWith(0, 30, 127, { time: 1 });
        expect(guide.noteOn).not.toHaveBeenCalled();
      });

      it('sends the notes of an awaited hand to the guide too', () => {
        state.playConfiguration.waitForRightHand = true;
        audio.scheduleHandNote('rh', note({ time: 1, midi: 72 }), 0, 1, 2, callbacks());
        schedule.runAll();
        expect(guide.noteOn).toHaveBeenCalledWith(72, expect.any(Number), 'rh', expect.any(Number));
        expect(synth.noteOn).not.toHaveBeenCalled();
      });

      it('sends nothing to the guide while listening (the app plays both hands)', () => {
        audio.scheduleHandNote('rh', note({ time: 1, midi: 72 }), 0, 1, 2, callbacks());
        schedule.runAll();
        expect(guide.noteOn).not.toHaveBeenCalled();
        expect(synth.noteOn).toHaveBeenCalled();
      });

      it('plays the other hand too, without the guide and without an assessment', () => {
        state.playConfiguration.alongRightHand = true;
        audio.scheduleHandNote('lh', note({ time: 1, midi: 48 }), 0, 1, 2, callbacks());
        schedule.runAll();
        expect(synth.noteOn).toHaveBeenCalled();
        expect(guide.noteOn).not.toHaveBeenCalled();
        expect(assess.expectTimed).not.toHaveBeenCalled();
      });

      it('turns the guide off when playback stops', () => {
        audio.stop();
        expect(guide.allOff).toHaveBeenCalled();
      });
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
      audio.startRollingSchedule();
      expect(spy.mock.calls.map(([, n]) => n.time)).toEqual([2]);
    });
  });

  describe('rolling schedule', () => {
    const callbacks = () => ({ onNoteStart: vi.fn(), onNoteEnd: vi.fn() });
    const notesEvery = (seconds: number, count: number) => Array.from({ length: count }, (_, i) => note({ time: i * seconds }));
    let position: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      position = vi.spyOn(Tone.getTransport(), 'seconds', 'get').mockReturnValue(0); // a fresh Play
    });
    afterEach(() => position.mockRestore());

    it(`puts the notes on the transport SCHEDULE_AHEAD_S ahead, topped up every SCHEDULE_REFILL_S`, () => {
      const spy = vi.spyOn(audio, 'scheduleHandNote');
      audio.scheduleHandTrack('rh', track(notesEvery(1, 20)), 0, 100, 0, 1, callbacks());
      audio.startRollingSchedule();
      expect(spy).toHaveBeenCalledTimes(SCHEDULE_AHEAD_S); // notes at 0, 1, 2, 3
      const refill = schedule.events.find((e) => e.kind === `repeat every ${SCHEDULE_REFILL_S}`)!;
      position.mockReturnValue(5);
      refill.fn(0);
      expect(spy).toHaveBeenCalledTimes(9); // up to 5 + SCHEDULE_AHEAD_S
    });

    it('merges the hands and the accompaniment in time order', () => {
      const order: string[] = [];
      vi.spyOn(audio, 'scheduleHandNote').mockImplementation((hand) => { order.push(hand); });
      vi.spyOn(audio, 'scheduleAccompanimentNote').mockImplementation(() => { order.push('acc'); });
      audio.scheduleHandTrack('rh', track([note({ time: 0 }), note({ time: 2 })]), 0, 100, 0, 1, callbacks());
      audio.scheduleHandTrack('lh', track([note({ time: 1 })]), 0, 100, 0, 1, callbacks());
      audio.scheduleAccompanimentTrack(2, track([note({ time: 0.5 })]), 0, 100, 1, 0);
      audio.startRollingSchedule();
      expect(order).toEqual(['rh', 'acc', 'lh', 'rh']);
    });

    it('skips the notes before where the transport resumes after a Pause', () => {
      const spy = vi.spyOn(audio, 'scheduleHandNote');
      position.mockReturnValue(10);
      audio.scheduleHandTrack('rh', track(notesEvery(1, 14)), 0, 100, 0, 1, callbacks());
      audio.startRollingSchedule();
      expect(spy.mock.calls.map(([, n]) => n.time)).toEqual([10, 11, 12, 13]);
    });

    it('forgets the queue when the schedule is cleared', () => {
      const spy = vi.spyOn(audio, 'scheduleHandNote');
      audio.scheduleHandTrack('rh', track(notesEvery(1, 10)), 0, 100, 0, 1, callbacks());
      audio.clearSchedule();
      audio.startRollingSchedule();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('mixer (audio-mixer.service.ts)', () => {
    const callbacks = () => ({ onNoteStart: vi.fn(), onNoteEnd: vi.fn() });
    let mixer: AudioMixerService;
    beforeEach(() => {
      mixer = TestBed.inject(AudioMixerService);
      audio.pianoMLShouldPlay = true;
    });

    it('plays the score at its level, on the synth and the MIDI outputs alike', () => {
      mixer.setLevel('score', 0.5);
      audio.scheduleHandNote('rh', note({ velocity: 1 }), 0, 1, 0, callbacks());
      schedule.runAll();
      expect(synth.noteOn).toHaveBeenCalledWith(0, 60, 64, expect.anything());
      expect(midi.pressOutput).toHaveBeenCalledWith(60, 64 / 127, expect.any(Number));
    });

    it('sends nothing for a silent bus, but still the note-offs', () => {
      mixer.setLevel('score', 0);
      audio.scheduleHandNote('rh', note({}), 0, 1, 0, callbacks());
      schedule.runAll();
      expect(synth.noteOn).not.toHaveBeenCalled();
      expect(midi.pressOutput).not.toHaveBeenCalled();
      expect(midi.releaseOutput).toHaveBeenCalled();
    });

    it('plays the accompaniment and the metronome at their own levels', () => {
      mixer.setLevel('accompaniment', 0.5);
      mixer.setLevel('metronome', 0);
      audio.scheduleAccompanimentNote(3, note({ time: 0, velocity: 1 }), 0, 1, 0);
      schedule.runAll();
      expect(synth.noteOn).toHaveBeenCalledWith(3, 60, 42, expect.anything()); // 127 * 0.66 * 0.5
      audio.playMetronomeClick(true, 43, 10);
      expect(midi.pressDrum).not.toHaveBeenCalled();
    });

    it('keeps the calibration clicks at full volume whatever the mixer', () => {
      mixer.setLevel('metronome', 0);
      audio.playMetronomeClick(true, 127, 10, null);
      expect(synth.noteOn).toHaveBeenCalledWith(9, 34, 127, { time: 10 });
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

    it('plays the count-in at full volume whatever the mixer, then the metronome at the mixer\'s level', () => {
      state.playConfiguration.useMetronome = true;
      const click = vi.spyOn(audio, 'playMetronomeClick').mockImplementation(() => undefined);
      audio.startCountIn(1, { timeSignature: [2, 4] } as TimeSignatureEvent, 120);
      schedule.events.filter((e) => !e.kind.startsWith('repeat')).forEach((e) => e.fn(0));
      schedule.events.find((e) => e.kind.startsWith('repeat'))!.fn(0);
      // [velocity, bus]: the count-in on no bus, the metronome on its bus
      expect(click.mock.calls.map(([, velocity, , bus]) => [velocity, bus])).toEqual([[127, null], [127, null], [127, undefined]]);
    });

    it('clicks at the metronome level of the mixer: 30 % by default', () => {
      TestBed.inject(AudioMixerService).reset();
      audio.playMetronomeClick(true, undefined, 10);
      expect(synth.noteOn).toHaveBeenCalledWith(9, 34, 38, { time: 10 }); // 127 * 0.3
      localStorage.removeItem(MIXER_STORAGE_KEY);
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

    it('shows each beat on the indicator, count-in then playing, metronome on or off', () => {
      state.playConfiguration.useMetronome = false;
      const click = vi.spyOn(audio, 'playMetronomeClick').mockImplementation(() => undefined);
      audio.startCountIn(2, { timeSignature: [3, 4] } as TimeSignatureEvent, 120);
      const seen: string[] = [];
      for (const event of schedule.events.filter((e) => !e.kind.startsWith('repeat'))) {
        event.fn(0);
        const b = state.beat()!;
        seen.push(`${b.phase} ${b.countInBar}:${b.beat}`);
      }
      expect(seen).toEqual(['count-in 1:1', 'count-in 1:2', 'count-in 1:3', 'count-in 2:1', 'count-in 2:2', 'count-in 2:3']);
      const clicks = click.mock.calls.length;
      const repeat = schedule.events.find((e) => e.kind.startsWith('repeat'))!;
      const seq = state.beat()!.seq;
      repeat.fn(0); repeat.fn(0);
      expect(state.beat()).toMatchObject({ phase: 'playing', beat: 2, beatsPerBar: 3, beatSeconds: 0.5, seq: seq + 2 });
      expect(click.mock.calls.length).toBe(clicks); // the metronome is off: no click while playing
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

    it('resumes a paused transport synchronously only when everything already runs', () => {
      const context = (audio as unknown as { audioContext: AudioContext }).audioContext;
      const transport = Tone.getTransport();
      const start = vi.spyOn(transport, 'start').mockReturnValue(transport);
      const state = vi.spyOn(transport, 'state', 'get').mockReturnValue('paused');
      const contextState = vi.spyOn(context, 'state', 'get').mockReturnValue('running');
      expect(audio.resumeNow()).toBe(true);
      expect(start).toHaveBeenCalledOnce();
      contextState.mockReturnValue('suspended');
      expect(audio.resumeNow()).toBe(false); // start() must resume the context first
      contextState.mockReturnValue('running');
      state.mockReturnValue('stopped');
      expect(audio.resumeNow()).toBe(false); // a first play
      expect(start).toHaveBeenCalledOnce();
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
      expect(clicks).toHaveLength(24);
      expect(new Set(vi.mocked(audio.playMetronomeClick).mock.calls.map(([, velocity]) => velocity))).toEqual(new Set([127]));
      for (const click of clicks) listener({ type: 'down', note: 60, time: 0, timeStamp: (click + 0.07) * 1000 });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await done).toBe(70);
      expect(audio.latencyCalibrationMs()).toBe(70);
      vi.useRealTimers();
      audio.setLatencyCalibration(0);
    });

    it('in loopback, calibrates from the clicks the microphone recorded, in the scoring\'s terms', async () => {
      vi.spyOn(audio, 'initSoundFont').mockResolvedValue();
      vi.spyOn(context(), 'resume').mockResolvedValue();
      // What the scoring takes for heard lags the context time by 150 ms; the outputLatency property says otherwise
      vi.spyOn(audio, 'heardContextTime').mockImplementation(() => context().currentTime - 0.15);
      vi.spyOn(context(), 'outputLatency', 'get').mockReturnValue(0.4);
      vi.spyOn(audio, 'playMetronomeClick').mockImplementation(() => undefined);
      const clicks = () => vi.mocked(audio.playMetronomeClick).mock.calls.map(([, , time]) => time!);
      // The recording: each click captured 250 ms after it was played (a 3 kHz burst over a quiet background)
      const RATE = 16000;
      const stop = vi.fn(async () => {
        const start = clicks()[0] - 0.5;
        const samples = new Float32Array(Math.round((clicks()[23] + 1 - start) * RATE));
        for (const click of clicks()) {
          const at = Math.round((click + 0.25 - start) * RATE);
          for (let i = 0; i < 0.03 * RATE; i++) samples[at + i] = 0.3 * Math.exp(-i / (0.008 * RATE)) * Math.sin(2 * Math.PI * 3000 * i / RATE);
        }
        for (let i = 0; i < samples.length; i++) samples[i] += 0.001 * Math.sin(i * 1.7);
        return { samples, sampleRate: RATE, startTime: start };
      });
      vi.spyOn(TestBed.inject(MicrophoneService), 'record').mockResolvedValue({ inputLatency: 0.03, stop });
      vi.useFakeTimers();
      const onTap = vi.fn();
      const done = audio.calibrateLatency(undefined, 'loopback', onTap);
      await vi.advanceTimersByTimeAsync(0);
      expect(clicks()).toHaveLength(24);
      await vi.advanceTimersByTimeAsync(20_000);
      // 250 ms: 30 ms of input latency, 150 ms of output latency the scoring accounts for, 70 ms it misses
      expect(await done).toBe(70);
      expect(stop).toHaveBeenCalledOnce();
      expect(onTap).toHaveBeenCalledTimes(24);
      expect(onTap).toHaveBeenNthCalledWith(1, { click: 0, ms: 70, measured: true });
      expect(onTap).toHaveBeenLastCalledWith({ click: 23, ms: 70, measured: true });
      vi.useRealTimers();
      audio.setLatencyCalibration(0);
    });

    it('rejects without playing a click when the microphone cannot be opened', async () => {
      vi.spyOn(audio, 'initSoundFont').mockResolvedValue();
      vi.spyOn(context(), 'resume').mockResolvedValue();
      vi.spyOn(TestBed.inject(MicrophoneService), 'record').mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
      const click = vi.spyOn(audio, 'playMetronomeClick').mockImplementation(() => undefined);
      await expect(audio.calibrateLatency(undefined, 'loopback')).rejects.toThrow('denied');
      expect(click).not.toHaveBeenCalled();
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

  describe('a context for Tone on Firefox', () => {
    it('gives an AudioListener without positionX... AudioParams real ones, with their default values', () => {
      const context = new OfflineAudioContext(1, 128, 48000);
      // Firefox's listener: none of the AudioParams
      const listener = {};
      Object.defineProperty(context, 'listener', { value: listener });
      withListenerParams(context);
      const params = listener as Record<string, AudioParam>;
      for (const name of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) {
        expect(params[name]).toBeInstanceOf(AudioParam);
      }
      expect([params['forwardZ'].value, params['upY'].value, params['positionX'].value]).toEqual([-1, 1, 0]);
    });

    it('leaves a listener that has them alone', () => {
      const context = new OfflineAudioContext(1, 128, 48000);
      const positionX = context.listener.positionX;
      withListenerParams(context);
      expect(context.listener.positionX).toBe(positionX);
    });
  });
});
