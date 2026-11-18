import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type PianoKeys from '@jesperdj/pianokeys';
import { Midi } from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import { SIMPLE_SCORE, renderScore, scoreMidi } from '../../testing/score-fixture';
import type { PlayConfiguration } from '../model/model';
import { CursorService } from './cursor.service';
import { midiToPitch } from './midi-maths';
import { type LiveStatus, PlayerAssessService } from './player-assess.service';
import { PlayerAudioService } from './player-audio.service';
import { PlayerKeyboardService } from './player-keyboard.service';
import { COUNT_IN_BARS, PlayerService } from './player.service';
import { PracticeSessionRecorder } from './practice-session-recorder.service';

type Callbacks = { onNoteStart: (t: number, n: Note, s: LiveStatus) => void; onNoteEnd: (t: number, n: Note, s: LiveStatus) => void };

const status = (overrides: Partial<LiveStatus> = {}): LiveStatus => ({
  shouldPause: false, expectations: new Map(), early: new Map(), bad: null, total: 0, badCount: 0, late: 0, ...overrides,
});

describe('PlayerService', () => {
  let player: PlayerService;
  let audio: PlayerAudioService;
  let cursor: CursorService;
  let assess: PlayerAssessService;
  let keys: { fillKey: ReturnType<typeof vi.fn>; clearKey: ReturnType<typeof vi.fn> };
  let midiEvent: ReturnType<typeof signal<MidiStateEvent | null>>;
  let midiService: Record<'setupMidiDeviceListeners' | 'resetSessionOutputs', ReturnType<typeof vi.fn>> & { midiEvent: typeof midiEvent };
  /** What the player registered with addNoteListener(); null once it unsubscribed. */
  let noteListener: ((event: MidiStateEvent) => void) | null;
  let handTracks: { hand: string; start: number; end: number; offset: number; timeFactor: number; callbacks: Callbacks }[];
  let onEnd: (() => void) | undefined;

  const config = (overrides: Partial<PlayConfiguration> = {}) => ({
    tempoFactor: 1, delayFactor: 1, scoreRange: [0, 0], waitForLeftHand: false, waitForRightHand: false,
    useMetronome: false, isLoop: false, ...overrides,
  }) as PlayConfiguration;

  /** Preconfigures the player for the fixture score (2 tracks, 3 bars of 4/4 at 120 BPM). */
  function load(overrides: Partial<PlayConfiguration> = {}, scoreInfo = {}) {
    return player.preconfigurePlayConfiguration(scoreInfo as never, config(overrides), scoreMidi(SIMPLE_SCORE));
  }

  beforeEach(() => {
    localStorage.removeItem('tempo-control-metronome');
    midiEvent = signal<MidiStateEvent | null>(null);
    noteListener = null;
    midiService = {
      midiEvent, setupMidiDeviceListeners: vi.fn(), resetSessionOutputs: vi.fn(),
      addNoteListener: vi.fn((listener: (event: MidiStateEvent) => void) => {
        noteListener = listener;
        return () => { noteListener = null; };
      }),
      pianoMLShouldPlay: vi.fn(() => true), pressOutput: vi.fn(), releaseOutput: vi.fn(),
    } as never;
    TestBed.configureTestingModule({ providers: [{ provide: MidiServiceService, useValue: midiService }] });
    player = TestBed.inject(PlayerService);
    audio = TestBed.inject(PlayerAudioService);
    cursor = TestBed.inject(CursorService);
    assess = TestBed.inject(PlayerAssessService);
    keys = { fillKey: vi.fn(), clearKey: vi.fn() };
    TestBed.inject(PlayerKeyboardService).setPianoKeys(keys as unknown as PianoKeys.Keyboard);

    handTracks = [];
    onEnd = undefined;
    vi.spyOn(audio, 'start').mockResolvedValue();
    vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    vi.spyOn(audio, 'stop').mockImplementation(() => undefined);
    vi.spyOn(audio, 'clearSchedule').mockImplementation(() => undefined);
    vi.spyOn(audio, 'startCountIn').mockReturnValue(2);
    vi.spyOn(audio, 'scheduleAccompanimentTracks').mockImplementation(() => undefined);
    vi.spyOn(audio, 'scheduleHandTrack').mockImplementation((hand, _track, start, end, offset, timeFactor, callbacks) => {
      handTracks.push({ hand, start, end, offset, timeFactor, callbacks });
    });
    vi.spyOn(audio, 'scheduleEnd').mockImplementation((_time, cb) => { onEnd = cb; });
    // The visual work of a due note runs at once, as if its frame came
    vi.spyOn(audio, 'scheduleDraw').mockImplementation((cb) => cb());
  });

  it('listens for MIDI devices in the browser', () => {
    expect(midiService.setupMidiDeviceListeners).toHaveBeenCalled();
  });

  describe('preconfigurePlayConfiguration', () => {
    it('studies both hands of a two-track MIDI file and sets the bar range', () => {
      const cfg = load();
      expect(cfg.midi!.tracks).toHaveLength(2);
      expect(cfg.accompaniment!.tracks).toHaveLength(0);
      expect(cfg.maxStaveCount).toBe(2); // index of the last bar
      expect(cfg.scoreRange).toEqual([0, 3]); // all 3 bars
      expect(player.duration).toBeCloseTo(6); // 3 bars of 4/4 at 120 BPM
    });

    it('keeps other instruments as accompaniment', () => {
      const midi = scoreMidi(SIMPLE_SCORE);
      const strings = midi.addTrack();
      strings.instrument.number = 48;
      strings.addNote({ midi: 67, ticks: 0, durationTicks: 1920 });
      const cfg = player.preconfigurePlayConfiguration({ study_tracks: [0] } as never, config(), midi);
      expect(cfg.midi!.tracks).toHaveLength(2); // both piano tracks share the instrument
      expect(cfg.accompaniment!.tracks.map((t) => t.instrument.number)).toEqual([48]);
    });

    it("uses the score's tempo when the MIDI file only has the default 120 BPM", () => {
      expect(load({}, { tempo: 60 }).tempoFactor).toBe(0.5);
    });

    it('restores the metronome setting', () => {
      localStorage.setItem('tempo-control-metronome', 'true');
      expect(load().useMetronome).toBe(true);
    });

    it('adds a 4/4 time signature when the file has none', () => {
      expect(load().midi!.header.timeSignatures[0].timeSignature).toEqual([4, 4]);
    });

    it('drops empty tracks', () => {
      const midi = scoreMidi(SIMPLE_SCORE);
      midi.addTrack();
      expect(player.splitMidi(midi.toJSON(), [0, 1]).study.tracks).toHaveLength(2);
    });

    describe('with an empty first track (format 1 file: study_tracks count it)', () => {
      /** The fixture score behind an empty track, as @tonejs/midi reads a format 1 file: hands at file indexes 1 and 2. */
      function withEmptyFirstTrack() {
        const json = scoreMidi(SIMPLE_SCORE).toJSON();
        const empty = { ...json.tracks[0], name: 'conductor', notes: [], controlChanges: {}, pitchBends: [] };
        return { ...json, tracks: [empty, ...json.tracks] };
      }

      it('studies the two hands at the stored file indexes, right hand first', () => {
        const json = withEmptyFirstTrack();
        const { study, other } = player.splitMidi(json, [1, 2]);
        expect(study.tracks.map((t) => t.notes.length)).toEqual([json.tracks[1].notes.length, json.tracks[2].notes.length]);
        expect(study.tracks[0].notes[0].midi).toBe(json.tracks[1].notes[0].midi);
        expect(other.tracks).toHaveLength(0);
      });

      it('schedules the right hand and the left hand from the stored study tracks', async () => {
        const shifted = new Midi();
        shifted.fromJSON(withEmptyFirstTrack());
        const cfg = player.preconfigurePlayConfiguration({ study_tracks: [1, 2] } as never, config(), shifted);
        expect(cfg.midi!.tracks).toHaveLength(2);
        expect(cfg.accompaniment!.tracks).toHaveLength(0);
        await player.play(cfg);
        expect(handTracks.map((t) => t.hand)).toEqual(['rh', 'lh']);
      });

      it('studies every track of the instrument from a single file index', () => {
        expect(player.splitMidi(withEmptyFirstTrack(), [1]).study.tracks).toHaveLength(2);
      });

      it('ignores a study index pointing at an empty or missing track', () => {
        const { study, other } = player.splitMidi(withEmptyFirstTrack(), [0, 7]);
        expect(study.tracks).toHaveLength(0);
        expect(other.tracks).toHaveLength(2);
      });
    });
  });

  describe('play', () => {
    it('counts in, then schedules both hands over the whole score', async () => {
      const cfg = load();
      await player.play(cfg);
      expect(audio.start).toHaveBeenCalled();
      expect(audio.startCountIn).toHaveBeenCalledWith(COUNT_IN_BARS, cfg.midi!.header.timeSignatures[0], 120);
      expect(handTracks.map(({ hand, start, end, offset, timeFactor }) => ({ hand, start, end, offset, timeFactor }))).toEqual([
        { hand: 'rh', start: 0, end: 6 + 2, offset: 2, timeFactor: 1 }, // 3 bars of 2 s, plus the count-in
        { hand: 'lh', start: 0, end: 6 + 2, offset: 2, timeFactor: 1 },
      ]);
      expect(audio.scheduleEnd).toHaveBeenCalledWith(8, expect.any(Function));
    });

    it('starts the transport only once everything is scheduled', async () => {
      const order: string[] = [];
      vi.mocked(audio.startCountIn).mockImplementation(() => { order.push('count-in'); return 2; });
      vi.mocked(audio.scheduleHandTrack).mockImplementation((hand) => { order.push(hand); });
      vi.mocked(audio.scheduleEnd).mockImplementation(() => { order.push('end'); });
      vi.mocked(audio.start).mockImplementation(async () => { order.push('start'); });
      await player.play(load());
      expect(order).toEqual(['count-in', 'rh', 'lh', 'end', 'start']);
    });

    it('plays only the selected bars', async () => {
      const cfg = load();
      cfg.scoreRange = [2, 3];
      await player.play(cfg);
      expect(handTracks[0]).toMatchObject({ start: 2, end: 2 + 2 + 2 }); // from bar 2, one bar, plus the count-in
    });

    it('scales times with the tempo', async () => {
      const cfg = load({ tempoFactor: 2 });
      await player.play(cfg);
      expect(audio.startCountIn).toHaveBeenCalledWith(COUNT_IN_BARS, expect.anything(), 240);
      expect(handTracks[0]).toMatchObject({ end: 3 + 2, timeFactor: 0.5 }); // twice as fast: 3 s
    });

    it('at the end, says END, rewinds, and starts again when looping', async () => {
      vi.useFakeTimers();
      const cfg = load({ isLoop: true });
      await player.play(cfg);
      const play = vi.spyOn(player, 'play');
      onEnd!();
      expect(player.message()).toBe('END');
      vi.advanceTimersByTime(100);
      expect(player.message()).toBe('');
      expect(player.lastMidiEventTime).toBe(-1);
      expect(play).toHaveBeenCalledWith(cfg);
      vi.useRealTimers();
    });

    it('when a note becomes due, lights it and moves the cursor forward only', async () => {
      const nextNote = vi.spyOn(cursor, 'nextNote').mockImplementation(() => undefined);
      await player.play(load());
      const { callbacks } = handTracks[0];
      const n = (ticks: number) => ({ midi: 72, name: 'C5', ticks, velocity: 1 }) as Note;
      callbacks.onNoteStart(0, n(480), status());
      callbacks.onNoteStart(0, n(0), status()); // earlier tick (other hand, chord): no backward move
      expect(nextNote).toHaveBeenCalledTimes(1);
      expect(keys.fillKey).toHaveBeenCalledWith('C5', expect.any(String));
      callbacks.onNoteEnd(0, n(480), status());
      expect(keys.clearKey).toHaveBeenCalledWith('C5');
    });

    it('decides to pause in the transport callback, before the frame that shows it', async () => {
      vi.spyOn(cursor, 'nextNote').mockImplementation(() => undefined);
      const frames: (() => void)[] = [];
      vi.mocked(audio.scheduleDraw).mockImplementation((cb) => { frames.push(cb); });
      await player.play(load());
      const waiting = status({ shouldPause: true, expectations: new Map([[1, new Set([{ hand: 'rh', midi: 72 }])]]) });
      handTracks[0].callbacks.onNoteStart(3, { midi: 72, name: 'C5', ticks: 0, velocity: 1 } as Note, waiting);
      expect(audio.pause).toHaveBeenCalled(); // no frame yet
      expect(player.isWaiting).toBe(true);
      expect(keys.fillKey).not.toHaveBeenCalled();
      expect(audio.scheduleDraw).toHaveBeenCalledWith(expect.any(Function), 3);
      frames.forEach((frame) => frame());
      expect(keys.fillKey).toHaveBeenCalledWith('C5', expect.any(String));
    });

    it('pauses and shows the expected notes while the user has to play', async () => {
      vi.spyOn(cursor, 'nextNote').mockImplementation(() => undefined);
      await player.play(load());
      const waiting = status({ shouldPause: true, expectations: new Map([[1, new Set([{ hand: 'lh', midi: 48 }])]]) });
      handTracks[0].callbacks.onNoteStart(0, { midi: 72, name: 'C5', ticks: 0, velocity: 1 } as Note, waiting);
      expect(player.isWaiting).toBe(true);
      expect(audio.pause).toHaveBeenCalled();
      expect(keys.fillKey).toHaveBeenCalledWith('C3', expect.any(String)); // the expected note, lit for the left hand
      handTracks[0].callbacks.onNoteEnd(0, { midi: 72, name: 'C5', ticks: 0 } as Note, waiting);
      expect(audio.pause).toHaveBeenCalledTimes(2);
    });
  });

  describe('MIDI input', () => {
    const down = (note: number) => ({ type: 'down', note, velocity: 100, time: 0 }) as unknown as MidiStateEvent;
    /** Delivers a MIDI event as the MIDI service does (synchronously), and lets the (async) handling finish. */
    const settle = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve(); // microtasks only: works with fake timers
    };
    const send = async (event: MidiStateEvent) => {
      noteListener!(event);
      await settle();
    };

    it('is ignored unless the user plays a hand', async () => {
      const getNewActual = vi.spyOn(assess, 'getNewActual');
      load();
      await send(down(60));
      expect(getNewActual).not.toHaveBeenCalled();
    });

    it('in play-along mode, assesses each key press against the notes due around that time', async () => {
      load();
      vi.spyOn(audio, 'isPlaying').mockReturnValue(true);
      const heard = vi.spyOn(audio, 'heardTransportSeconds').mockReturnValue(3.1);
      const playTimed = vi.spyOn(assess, 'playTimed');
      assess.expectTimed(3, { midi: 72, bars: 0 } as Note, 'rh');
      await send({ ...down(72), timeStamp: 1234 });
      expect(heard).toHaveBeenCalledWith(1234); // when the key was played, on the clock of what was heard then
      expect(playTimed).toHaveBeenCalledWith(3.1, 72);
      expect(assess.snapshot()).toMatchObject({ hit: 1, wrong: 0, played: 1 });
    });

    it('in play-along mode, ignores keys while playback is stopped', async () => {
      load();
      const playTimed = vi.spyOn(assess, 'playTimed');
      await send(down(72));
      expect(playTimed).not.toHaveBeenCalled();
    });

    it('a right note resumes playback at once, in the MIDI listener, when everything runs', () => {
      load({ waitForRightHand: true });
      player.isWaiting = true;
      vi.spyOn(assess, 'getNewActual').mockReturnValue(status());
      const resumeNow = vi.spyOn(audio, 'resumeNow').mockReturnValue(true);
      noteListener!(down(72)); // no await
      expect(resumeNow).toHaveBeenCalledOnce();
      expect(player.isWaiting).toBe(false);
      expect(audio.start).not.toHaveBeenCalled();
    });

    it('a right note resumes playback when it was waiting', async () => {
      load({ waitForRightHand: true });
      player.isWaiting = true;
      vi.spyOn(assess, 'getNewActual').mockReturnValue(status());
      vi.spyOn(audio, 'resumeNow').mockReturnValue(false); // e.g. a suspended context: start() it is
      await send(down(72));
      expect(audio.start).toHaveBeenCalled();
      expect(player.isWaiting).toBe(false);
      expect(keys.clearKey).toHaveBeenCalledWith('C5');
    });

    it('keeps waiting while notes are still expected', async () => {
      load({ waitForRightHand: true });
      player.isWaiting = true;
      vi.spyOn(assess, 'getNewActual').mockReturnValue(status({ shouldPause: true }));
      await send(down(72));
      expect(player.isWaiting).toBe(true);
      expect(audio.start).not.toHaveBeenCalled();
    });

    it('takes every note of a chord played in the same task, and then resumes', async () => {
      const cfg = load({ waitForRightHand: true });
      vi.spyOn(cursor, 'nextNote').mockImplementation(() => undefined);
      cursor.midiTicksToOsmdCursorIndex.set(0, { osmdIndex: 0, osmdMeasure: 0 });
      await player.play(cfg);
      player.isWaiting = true;
      const chord = [60, 64, 67].map((midi) => ({ midi, ticks: 0, bars: 0 }) as Note);
      for (const note of chord) assess.learnExpectation(1, 2, note, 'rh');
      vi.mocked(audio.start).mockClear();
      // Back to back, with no change detection in between: an effect on the signal saw only the last one
      for (const note of chord) noteListener!(down(note.midi));
      await settle();
      expect(assess.snapshot().hit).toBe(3);
      expect(player.isWaiting).toBe(false);
      expect(audio.start).toHaveBeenCalledTimes(1);
    });

    it('marks a play-along session as played on a MIDI keyboard', async () => {
      const recorder = TestBed.inject(PracticeSessionRecorder);
      const noteOn = vi.spyOn(recorder, 'noteOn');
      load();
      await send(down(60));
      expect(noteOn).toHaveBeenCalledOnce();
    });

    it('stops listening when the player is destroyed', () => {
      player.ngOnDestroy();
      expect(noteListener).toBeNull();
    });

    it('ignores key releases', async () => {
      load({ waitForRightHand: true });
      const getNewActual = vi.spyOn(assess, 'getNewActual');
      await send({ type: 'up', note: 72 } as unknown as MidiStateEvent);
      expect(getNewActual).not.toHaveBeenCalled();
    });

    describe('wrong notes on the score', () => {
      let dispose: () => void;
      afterEach(() => { vi.useRealTimers(); dispose?.(); });

      it('shows BAD and marks the closest note under the cursor in red for a second', async () => {
        const cfg = load({ waitForRightHand: true });
        const rendered = await renderScore(SIMPLE_SCORE);
        dispose = rendered.dispose;
        await player.setOsmd(rendered.osmd);
        rendered.osmd.cursor.reset();
        vi.useFakeTimers();
        vi.spyOn(assess, 'getNewActual').mockReturnValue(status({ bad: 73 }));
        await send(down(73));
        expect(player.message()).toBe('BAD');
        const red = rendered.host.querySelectorAll('[fill="#FF0000"]');
        expect(red.length).toBeGreaterThan(0);
        vi.advanceTimersByTime(1000);
        expect(player.message()).toBe('');
        expect(cfg.midi).toBeDefined();
      });

      it('in play-along mode too: red note on the score, red key, BAD, as the key is pressed', async () => {
        load();
        const rendered = await renderScore(SIMPLE_SCORE);
        dispose = rendered.dispose;
        await player.setOsmd(rendered.osmd);
        rendered.osmd.cursor.reset();
        vi.spyOn(audio, 'isPlaying').mockReturnValue(true);
        vi.spyOn(assess, 'playTimed').mockReturnValue({ bad: true });
        const before = player.wrongNotes();
        noteListener!(down(73)); // no await: shown synchronously
        expect(player.message()).toBe('BAD');
        expect(player.wrongNotes()).toBe(before + 1);
        expect(rendered.host.querySelectorAll('[fill="#FF0000"]').length).toBeGreaterThan(0);
        expect(keys.fillKey).toHaveBeenCalledWith(midiToPitch(73), TestBed.inject(PlayerKeyboardService).COLOR_WRONG);
      });

      it('a right key on the MIDI keyboard is never lit', async () => {
        load({ waitForRightHand: true });
        vi.spyOn(assess, 'getNewActual').mockReturnValue(status());
        await send(down(72));
        expect(keys.fillKey.mock.calls.filter(([name]) => name === midiToPitch(72))).toEqual([]);
      });

      it('clears the marking when playback restarts', async () => {
        const cfg = load({ waitForRightHand: true });
        const rendered = await renderScore(SIMPLE_SCORE);
        dispose = rendered.dispose;
        await player.setOsmd(rendered.osmd);
        rendered.osmd.cursor.reset();
        vi.spyOn(assess, 'getNewActual').mockReturnValue(status({ bad: 73 }));
        await send(down(73));
        player.resetLight(cfg);
        expect(player.message()).toBe('');
      });
    });
  });

  describe('practice recording', () => {
    let recorder: PracticeSessionRecorder;
    let calls: string[];

    beforeEach(() => {
      recorder = TestBed.inject(PracticeSessionRecorder);
      calls = [];
      vi.spyOn(recorder, 'takeStarted').mockImplementation(() => { calls.push('started'); });
      vi.spyOn(recorder, 'takeEnded').mockImplementation((completed) => { calls.push(completed ? 'completed' : 'cut'); });
      vi.spyOn(assess, 'reset').mockImplementation(() => { calls.push('reset'); });
    });

    it('Play opens a take on a fresh assessment', async () => {
      const cfg = load();
      calls = [];
      await player.play(cfg);
      expect(calls).toEqual(['cut', 'reset', 'started']); // any take left open is closed first
      expect(recorder.takeStarted).toHaveBeenCalledWith(cfg);
    });

    it('Play drops the notes before the position the transport resumes from', async () => {
      vi.spyOn(audio, 'getTransportSeconds').mockReturnValue(4.5);
      const beginTimed = vi.spyOn(assess, 'beginTimed');
      await player.play(load());
      expect(beginTimed).toHaveBeenCalledWith(4.5);
    });

    it('Pause closes the take', async () => {
      await player.play(load());
      calls = [];
      player.pause();
      expect(calls).toEqual(['cut']);
    });

    it('the end of the range completes the take before the assessment is reset', async () => {
      await player.play(load());
      vi.spyOn(assess, 'endTimed').mockImplementation(() => { calls.push('notes left missed'); });
      calls = [];
      onEnd!();
      expect(calls.slice(0, 2)).toEqual(['notes left missed', 'completed']);
      expect(calls.indexOf('reset')).toBeGreaterThan(0);
    });

    it('leaving the score ends the session before the assessment is reset', () => {
      const setItem = vi.spyOn(recorder, 'setItem').mockImplementation(() => { calls.push('session ended'); });
      player.releaseScoreSession();
      expect(setItem).toHaveBeenCalledWith(null);
      expect(calls).toEqual(['session ended', 'reset']);
    });
  });

  describe('elapsed time', () => {
    afterEach(() => vi.useRealTimers());

    it('counts practice time while playing a hand', () => {
      vi.useFakeTimers();
      load({ waitForRightHand: true });
      vi.spyOn(audio, 'isPlaying').mockReturnValue(true);
      player.setup();
      vi.advanceTimersByTime(1000);
      expect(player.elapsedTime.value).toBe(1000);
    });

    it('does not count while only listening', () => {
      vi.useFakeTimers();
      load();
      vi.spyOn(audio, 'isPlaying').mockReturnValue(true);
      player.setup();
      vi.advanceTimersByTime(1000);
      expect(player.elapsedTime.value).toBe(0);
    });
  });

  describe('session', () => {
    it('setOsmd maps the score for the cursor', async () => {
      load();
      const rendered = await renderScore(SIMPLE_SCORE);
      const slop = await player.setOsmd(rendered.osmd);
      expect(slop).toBe(0);
      expect(cursor.midiTicksToOsmdCursorIndex.size).toBeGreaterThan(0);
      expect(player.verticalPixelShiftValue).toBeGreaterThan(0);
      rendered.dispose();
    });

    it('releaseScoreSession clears the score, the keyboard and the MIDI outputs', () => {
      load();
      player.lastBar = 3;
      player.releaseScoreSession();
      expect(midiService.resetSessionOutputs).toHaveBeenCalled();
      expect(player.osmd).toBeNull();
      expect([player.lastBar, player.verticalPixelShiftValue]).toEqual([0, 1]);
    });

    it('reset rewinds the cursor to the first selected bar', () => {
      const cfg = load();
      const reset = vi.spyOn(cursor, 'reset');
      cfg.scoreRange = [2, 3];
      player.reset(cfg);
      expect(reset).toHaveBeenCalledWith(2);
      expect(audio.stop).toHaveBeenCalled();
      expect(player.lastMidiEventTime).toBe(-1);
    });

    it('lights the notes the user is expected to play', () => {
      vi.spyOn(assess, 'getExpectation').mockReturnValue(status({ expectations: new Map([[2, new Set([{ hand: 'rh', midi: 76 }])], [3, new Set([{ hand: 'rh', midi: 79 }])]]) }));
      player.displayLiveOnKeyboard();
      expect(keys.fillKey.mock.calls.map(([name]) => name)).toEqual(['E5']); // the oldest expectation only
    });

    it('forwards pause, cursor and soundfont calls', async () => {
      const init = vi.spyOn(audio, 'initSoundFont').mockResolvedValue();
      const tilt = vi.spyOn(cursor, 'tiltCursor').mockImplementation(() => undefined);
      player.pause();
      player.tiltCursor({} as never);
      await player.initSoundFont();
      expect([audio.pause, tilt, init].every((fn) => vi.mocked(fn).mock.calls.length === 1)).toBe(true);
      expect(player.getAssess()).toBe(assess);
    });

    it('stops its timers and releases the session when destroyed', () => {
      vi.useFakeTimers();
      load({ waitForRightHand: true });
      vi.spyOn(audio, 'isPlaying').mockReturnValue(true);
      player.setup();
      player.ngOnDestroy();
      vi.advanceTimersByTime(1000);
      expect(player.elapsedTime.value).toBe(0);
      expect(midiService.resetSessionOutputs).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
