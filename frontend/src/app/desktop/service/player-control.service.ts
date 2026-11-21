import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PracticeSessionRecorder } from './practice-session-recorder.service';

/**
 * Remote control of the workbench (coach, issue #414, phase 5): the one way for code outside the workbench to
 * read the player state and do what the workbench buttons do. The workbench registers a handle while it is on
 * screen; the handle runs the same code paths as the buttons, so the toolbar, the measure slider and the
 * practice recorder stay consistent.
 */

export type Hands = 'both' | 'left' | 'right' | 'listen';

/** How the student plays the hands they play (hand-mode.ts): waited for, or along with the app at tempo. */
export type HandsMode = 'wait' | 'along';

/** The take that just ended, before the server has it. */
export interface LastTake {
  /** ISO time the take started: tells two takes apart even when every count is the same */
  startedAt: string;
  measureStart: number;
  measureEnd: number;
  completed: boolean;
  tempoFactor: number;
  hands: string;
  notesExpected: number;
  notesHit: number;
  notesWrong: number;
  onsets: number;
  waits: number;
  /** notesHit / (notesExpected + notesWrong); null when nothing was assessed */
  accuracy: number | null;
  /** 1 - waits / onsets; null when nothing was assessed */
  flow: number | null;
}

/** What is on the music stand. Section 4.5 of docs/coach-external-harness.md. */
export interface PlayerState {
  /** A score or exercise is on the stand and ready to play */
  loaded: boolean;
  loading: boolean;
  /** Current app path */
  page: string;
  item: null | {
    kind: 'score' | 'exercise';
    scoreId?: string;
    slug?: string;
    title: string;
    author?: string;
    tonic?: string;
    mode?: string;
  };
  measureTotal: number;
  playing: boolean;
  /** 1-based */
  currentMeasure: number;
  /** 1-based, inclusive */
  range: { fromMeasure: number; toMeasure: number };
  tempo: { bpm: number; originalBpm: number; percent: number };
  loop: boolean;
  hands: Hands;
  /** How the student plays the hands: waited for, or played along with the app at tempo; null when listening. */
  handsMode: HandsMode | null;
  metronome: boolean;
  showKeyboard: boolean;
  midiInput: 'connected' | 'none' | 'blocked' | 'unknown';
  audioUnlocked: boolean;
  lastTake: LastTake | null;
}

/** The practice session in progress in the tab (tool get_current_session), before it is saved. */
export interface CurrentSession {
  item: { kind: string; title?: string; scoreId?: string; exerciseType?: string; patternKey?: string; exerciseKey?: string; tonic?: string; mode?: string };
  startedAt: string;
  activeSeconds: number;
  takeCount: number;
  completedCount: number;
  totals: Counters;
  takes: (Omit<LastTake, 'accuracy' | 'flow'> & { startedAt: string; activeSeconds: number; accuracy: number | null; flow: number | null })[];
  weakMeasures: (Counters & { measure: number })[];
}

export interface Counters {
  notesExpected: number;
  notesHit: number;
  notesWrong: number;
  onsets: number;
  waits: number;
  accuracy: number | null;
  flow: number | null;
}

/** What the workbench lends to {@link PlayerControlService} while it is on screen. */
export interface WorkbenchHandle {
  getState(): PlayerState;
  /** Loaded, not loading, no load error */
  isReady(): boolean;
  getLoadError(): string | null;
  /** 1-based, inclusive */
  setRange(fromMeasure: number, toMeasure: number): void;
  setWholeScore(): void;
  setTempoBpm(bpm: number): void;
  setLoop(value: boolean): void;
  /** The hands the student plays, waited for (the default) or played along; the other hand is played by the app. */
  setHands(value: Hands, mode?: HandsMode): void;
  setMetronome(value: boolean): void;
  setKeyboardVisible(value: boolean): void;
  play(restart: boolean): Promise<void>;
  stop(): void;
}

export { accuracyOf, flowOf, lastTakeOf } from './take-stats';

/** The hands setting from the workbench's two "wait for" switches. */
export function handsOf(waitForLeftHand: boolean, waitForRightHand: boolean): Hands {
  if (waitForLeftHand && waitForRightHand) return 'both';
  if (waitForLeftHand) return 'left';
  if (waitForRightHand) return 'right';
  return 'listen';
}

/** The two "wait for" switches for a hands setting. */
export function waitFor(hands: Hands): { left: boolean; right: boolean } {
  return { left: hands === 'both' || hands === 'left', right: hands === 'both' || hands === 'right' };
}

const READY_POLL_MS = 200;

@Injectable({ providedIn: 'root' })
export class PlayerControlService {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private current: WorkbenchHandle | null = null;

  register(handle: WorkbenchHandle): void {
    this.current = handle;
  }

  /** Ignored when another handle has been registered since (the next workbench came up first). */
  unregister(handle: WorkbenchHandle): void {
    if (this.current === handle) {
      this.current = null;
    }
  }

  handle(): WorkbenchHandle | null {
    return this.current;
  }

  /** The handle's state, or the "nothing loaded" state when no workbench is on screen. */
  state(): PlayerState {
    return this.current ? this.current.getState() : emptyState(this.router.url);
  }

  /** The practice session in progress in this tab, before it is saved; null when there is none. */
  currentSession(): CurrentSession | null {
    // Resolved lazily: the recorder pulls in the assessment and the session services
    return this.injector.get(PracticeSessionRecorder).currentSessionSnapshot();
  }

  /** Resolves once a workbench is registered and ready, or failed to load, or after {@code timeoutMs}. */
  waitUntilReady(timeoutMs: number): Promise<'ready' | 'error' | 'timeout'> {
    return new Promise(resolve => {
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        const handle = this.current;
        if (handle?.getLoadError()) {
          resolve('error');
        } else if (handle?.isReady()) {
          resolve('ready');
        } else if (Date.now() >= deadline) {
          resolve('timeout');
        } else {
          setTimeout(check, READY_POLL_MS);
        }
      };
      check();
    });
  }
}

export function emptyState(page: string): PlayerState {
  return {
    loaded: false,
    loading: false,
    page,
    item: null,
    measureTotal: 0,
    playing: false,
    currentMeasure: 0,
    range: { fromMeasure: 0, toMeasure: 0 },
    tempo: { bpm: 0, originalBpm: 0, percent: 100 },
    loop: false,
    hands: 'listen',
    handsMode: null,
    metronome: false,
    showKeyboard: true,
    midiInput: 'unknown',
    audioUnlocked: false,
    lastTake: null,
  };
}
