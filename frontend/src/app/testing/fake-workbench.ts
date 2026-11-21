import { vi } from 'vitest';
import { type PlayerState, type WorkbenchHandle, emptyState, waitFor } from '../desktop/service/player-control.service';

/** A workbench handle with a state that follows its calls, for the coach tool specs. */
export function fakeWorkbench(overrides: Partial<PlayerState> = {}) {
  const state: PlayerState = {
    ...emptyState('/work/prelude'),
    loaded: true,
    item: { kind: 'score', scoreId: 's1', slug: 'prelude', title: 'Prelude' },
    measureTotal: 8,
    currentMeasure: 1,
    range: { fromMeasure: 1, toMeasure: 8 },
    tempo: { bpm: 100, originalBpm: 100, percent: 100 },
    audioUnlocked: true,
    midiInput: 'connected',
    ...overrides,
  };
  let ready = true;
  let loadError: string | null = null;
  const handle: WorkbenchHandle = {
    getState: () => structuredClone(state),
    isReady: () => ready,
    getLoadError: () => loadError,
    setRange: vi.fn((from: number, to: number) => {
      state.range = { fromMeasure: from, toMeasure: to };
      state.currentMeasure = from;
    }),
    setWholeScore: vi.fn(() => {
      state.range = { fromMeasure: 1, toMeasure: state.measureTotal };
    }),
    setTempoBpm: vi.fn((bpm: number) => {
      state.tempo = { ...state.tempo, bpm, percent: Math.round((100 * bpm) / state.tempo.originalBpm) };
    }),
    setLoop: vi.fn((value: boolean) => { state.loop = value; }),
    setHands: vi.fn((value) => { state.hands = value; void waitFor(value); }),
    setMetronome: vi.fn((value: boolean) => { state.metronome = value; }),
    setKeyboardVisible: vi.fn((value: boolean) => { state.showKeyboard = value; }),
    play: vi.fn(async (restart: boolean) => {
      state.playing = true;
      if (restart) state.currentMeasure = state.range.fromMeasure;
    }),
    stop: vi.fn(() => { state.playing = false; }),
  };
  return {
    handle,
    state,
    setReady: (value: boolean) => { ready = value; },
    setLoadError: (value: string | null) => { loadError = value; },
  };
}
