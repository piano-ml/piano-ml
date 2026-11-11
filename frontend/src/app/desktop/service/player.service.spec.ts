import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type PianoKeys from '@jesperdj/pianokeys';
import type { Note } from '@tonejs/midi/dist/Note';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { MidiServiceService } from '../../shared/services/midi-service.service';
import { SIMPLE_SCORE, renderScore, scoreMidi } from '../../testing/score-fixture';
import type { PlayConfiguration } from '../model/model';
import { CursorService } from './cursor.service';
import { type LiveStatus, PlayerAssessService } from './player-assess.service';
import { PlayerAudioService } from './player-audio.service';
import { PlayerKeyboardService } from './player-keyboard.service';
import { PlayerService } from './player.service';

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
    midiService = {
      midiEvent, setupMidiDeviceListeners: vi.fn(), resetSessionOutputs: vi.fn(),
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
  });

  describe('play', () => {
    it('counts in, then schedules both hands over the whole score', async () => {
      const cfg = load();
      await player.play(cfg);
      expect(audio.start).toHaveBeenCalled();
      expect(audio.startCountIn).toHaveBeenCalledWith(2, cfg.midi!.header.timeSignatures[0], 120);
      expect(handTracks.map(({ hand, start, end, offset, timeFactor }) => ({ hand, start, end, offset, timeFactor }))).toEqual([
        { hand: 'rh', start: 0, end: 6 + 2, offset: 2, timeFactor: 1 }, // 3 bars of 2 s, plus the count-in
        { hand: 'lh', start: 0, end: 6 + 2, offset: 2, timeFactor: 1 },
      ]);
      expect(audio.scheduleEnd).toHaveBeenCalledWith(8, expect.any(Function));
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
      expect(audio.startCountIn).toHaveBeenCalledWith(2, expect.anything(), 240);
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
    /** Delivers a MIDI event and lets the (async) handling finish. */
    const send = async (event: MidiStateEvent) => {
      midiEvent.set(event);
      TestBed.tick();
      for (let i = 0; i < 5; i++) await Promise.resolve(); // microtasks only: works with fake timers
    };

    it('is ignored unless the user plays a hand', async () => {
      const getNewActual = vi.spyOn(assess, 'getNewActual');
      load();
      await send(down(60));
      expect(getNewActual).not.toHaveBeenCalled();
    });

    it('a right note resumes playback when it was waiting', async () => {
      load({ waitForRightHand: true });
      player.isWaiting = true;
      vi.spyOn(assess, 'getNewActual').mockReturnValue(status());
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
