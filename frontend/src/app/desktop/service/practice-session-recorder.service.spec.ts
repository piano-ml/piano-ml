import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { provideApi, type PracticeSessionApiInfo } from '../../core/api';
import type { PlayConfiguration } from '../model/model';
import { type AssessSnapshot, PlayerAssessService } from './player-assess.service';
import {
  CHECKPOINT_MS, IDLE_CUTOFF_MS, OUTBOX_KEY, PracticeSessionRecorder, SESSION_IDLE_MS, UNASSESSED_MAX_NOTES_PLAYED,
  assessedTake, type PracticeItem,
} from './practice-session-recorder.service';

const SCORE: PracticeItem = { kind: 'score', scoreId: 's1', title: 'Prelude' };
const EXERCISE: PracticeItem = {
  kind: 'exercise', exerciseType: 'scale', patternKey: 'harmonic_minor', exerciseKey: 'left_than_right', tonic: 'Am',
};

const config = (overrides: Partial<PlayConfiguration> = {}) => ({
  scoreRange: [0, 9], waitForLeftHand: true, waitForRightHand: true, tempoFactor: 1, useMetronome: false, isLoop: false,
  ...overrides,
}) as PlayConfiguration;

const counters = (expected: number, hit: number, wrong = 0, waits = 0, played = hit + wrong): AssessSnapshot => ({
  expected, hit, wrong, onsets: expected, waits,
  measures: expected ? [{ measure: 1, expected, hit, wrong, onsets: expected, waits }] : [],
  played,
});

/**
 * The recorder turns takes (Play to Stop) into one session per visit and keeps the server up to date with it.
 * Time is driven by hand: Date.now() for the active clock, fake timers for the checkpoint.
 */
describe('PracticeSessionRecorder', () => {
  let recorder: PracticeSessionRecorder;
  let http: HttpTestingController;
  let snapshot: AssessSnapshot;
  let now: number;

  function setup(userId: string | null = 'u1') {
    if (userId) {
      localStorage.setItem('userId', userId);
    }
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideApi({ basePath: '' }),
        { provide: PlayerAssessService, useValue: { snapshot: () => snapshot } },
      ],
    });
    recorder = TestBed.inject(PracticeSessionRecorder);
    http = TestBed.inject(HttpTestingController);
  }

  /** Plays for `seconds`, a note every 2 s, so the idle cut-off never applies. */
  function play(seconds: number) {
    for (let elapsed = 0; elapsed < seconds; elapsed += 2) {
      now += Math.min(2, seconds - elapsed) * 1000;
      recorder.noteOn();
    }
  }

  /** The PUT requests sent so far (and answers them 200). */
  function sent(): { id: string; body: PracticeSessionApiInfo }[] {
    return http.match((r) => r.method === 'PUT' && r.url.startsWith('/practice/session/')).map((request) => {
      request.flush({});
      return { id: request.request.url.split('/').pop() as string, body: request.request.body };
    });
  }

  beforeEach(() => {
    localStorage.removeItem('userId');
    localStorage.removeItem(OUTBOX_KEY);
    now = Date.parse('2026-11-15T10:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    snapshot = counters(10, 10); // an assessed take: unassessed sessions are not sent
  });

  afterEach(() => {
    recorder?.ngOnDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.removeItem('userId');
    localStorage.removeItem(OUTBOX_KEY);
  });

  describe('a take', () => {
    it('Stop sends the session: item, time, range, settings and counters', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config({ scoreRange: [2, 5], tempoFactor: 0.8, useMetronome: true }));
      play(60);
      snapshot = counters(100, 90, 10, 5);
      recorder.takeEnded(false);

      const [{ id, body }] = sent();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body).toMatchObject({
        kind: 'score', scoreId: 's1', title: 'Prelude',
        startedAt: '2026-11-15T10:00:00.000Z', endedAt: '2026-11-15T10:01:00.000Z',
        activeSeconds: 60, takeCount: 1, completedCount: 0,
        measureStart: 2, measureEnd: 4, measureTotal: 8,
        hands: 'both', tempoFactor: 0.8, metronome: true, loop: false, input: 'midi', endReason: 'stopped',
        notesExpected: 100, notesHit: 90, notesWrong: 10, onsets: 100, waits: 5,
        measures: [{ measure: 1, notesExpected: 100, notesHit: 90, notesWrong: 10, onsets: 100, waits: 5 }],
      });
      expect(body.takes).toHaveLength(1);
      expect(body.takes![0]).toMatchObject({ activeSeconds: 60, completed: false, hands: 'both', notesHit: 90 });
    });

    it('records a hand played along as a hand the student plays', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config({ waitForLeftHand: false, waitForRightHand: false, alongRightHand: true }));
      snapshot = counters(10, 8, 1, 9, 0);
      play(30);
      recorder.takeEnded(true);
      expect(recorder.lastTake()).toMatchObject({ hands: 'right' });
    });

    it('does not assess a take in which no key was pressed: with nothing assessed, the session is not sent', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config({ waitForLeftHand: false, waitForRightHand: false }));
      now += 20_000; // listened for 20 s
      recorder.activity();
      snapshot = counters(30, 0, 0, 0, 0); // 30 notes went by, none played
      recorder.takeEnded(true);
      expect(sent()).toEqual([]);
      expect(localStorage.getItem(OUTBOX_KEY)).toBeNull();
    });

    it('assesses a take only above UNASSESSED_MAX_NOTES_PLAYED key presses', () => {
      expect(UNASSESSED_MAX_NOTES_PLAYED).toBe(0);
      const take = (played: number) => counters(10, played, 0, 0, played);
      expect(assessedTake(take(3), 3)).toEqual({ expected: 0, hit: 0, wrong: 0, onsets: 0, waits: 0, measures: [], played: 3 });
      expect(assessedTake(take(4), 3)).toEqual(take(4));
    });

    it('the end of the range is a completed take', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(true);
      expect(sent()[0].body).toMatchObject({ completedCount: 1, endReason: 'ended', measureStart: 1, measureEnd: 8 });
    });

    it.each([
      [{ waitForLeftHand: true, waitForRightHand: false }, 'left'],
      [{ waitForLeftHand: false, waitForRightHand: true }, 'right'],
      [{ waitForLeftHand: false, waitForRightHand: false }, 'listen'],
    ] as const)('hands waited for %o are recorded as %s', (hands, expected) => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config(hands));
      play(20);
      recorder.takeEnded(false);
      expect(sent()[0].body.hands).toBe(expected);
    });

    it('without a MIDI keyboard, nothing is assessed: the session is not sent', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      for (let i = 0; i < 10; i++) {
        now += 2000;
        recorder.activity(); // the score moves on
      }
      snapshot = counters(10, 0, 0, 0, 0); // notes went by, no key can be pressed
      recorder.takeEnded(true);
      expect(sent()).toEqual([]);
    });

    it('is only sent for the user who played it, not for an account logged in since', () => {
      setup('u1');
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      localStorage.setItem('userId', 'u2'); // logged out, then in as someone else, in the same tab
      recorder.takeEnded(false);
      expect(sent()).toEqual([]);
    });

    it('the clock stops after 30 s without a note', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      now += 10 * 60_000; // a phone call
      play(20);
      recorder.takeEnded(false);
      // 20 s, then the gap up to the next note counted as 30 s, then the remaining 18 s
      expect(sent()[0].body.activeSeconds).toBe(20 + IDLE_CUTOFF_MS / 1000 + 18);
    });

    it('an exercise is recorded by its stable keys', () => {
      setup();
      recorder.setItem(EXERCISE, 4);
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(true);
      expect(sent()[0].body).toMatchObject({
        kind: 'exercise', exerciseType: 'scale', patternKey: 'harmonic_minor', exerciseKey: 'left_than_right', tonic: 'Am',
      });
    });
  });

  describe('a session', () => {
    it('several takes make one session: same id, counters added up', () => {
      setup();
      recorder.setItem(SCORE, 8);
      for (let pass = 0; pass < 5; pass++) { // a loop
        recorder.takeStarted(config({ isLoop: true }));
        play(10);
        snapshot = counters(10, 9, 1);
        recorder.takeEnded(true);
      }

      const requests = sent();
      expect(new Set(requests.map((r) => r.id)).size).toBe(1);
      expect(requests.at(-1)!.body).toMatchObject({
        takeCount: 5, completedCount: 5, activeSeconds: 50, loop: true, notesExpected: 50, notesHit: 45, notesWrong: 5,
        measures: [{ measure: 1, notesExpected: 50, notesHit: 45 }],
      });
      expect(requests.at(-1)!.body.takes).toHaveLength(5);
    });

    it('Play while a take is open closes it first', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(false);
      expect(sent().at(-1)!.body).toMatchObject({ takeCount: 2, activeSeconds: 40 });
    });

    it('Play after 5 minutes away starts a new session', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(false);
      now += SESSION_IDLE_MS + 1;
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(false);

      const requests = sent();
      expect(new Set(requests.map((r) => r.id)).size).toBe(2);
      expect(requests.at(-1)!.body).toMatchObject({ takeCount: 1, activeSeconds: 20 });
    });

    it('another score ends the session, with the take in progress', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      recorder.setItem({ kind: 'score', scoreId: 's2' }, 4);

      const requests = sent();
      expect(requests.at(-1)!.body).toMatchObject({ scoreId: 's1', takeCount: 1, endReason: 'left' });

      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(false);
      const next = sent();
      expect(next[0].body.scoreId).toBe('s2');
      expect(next[0].id).not.toBe(requests[0].id);
    });

    it('is saved every 30 s while playing, with the take in progress', () => {
      vi.useFakeTimers();
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(30);
      snapshot = counters(40, 40);
      vi.advanceTimersByTime(CHECKPOINT_MS);

      const [{ id, body }] = sent();
      expect(body).toMatchObject({ takeCount: 1, activeSeconds: 30, notesExpected: 40 });
      expect(body.endReason).toBeUndefined();

      play(10);
      snapshot = counters(50, 50);
      recorder.takeEnded(false);
      const [final] = sent();
      expect(final.id).toBe(id);
      expect(final.body).toMatchObject({ takeCount: 1, activeSeconds: 40, notesExpected: 50 }); // not counted twice

      vi.advanceTimersByTime(CHECKPOINT_MS * 3);
      expect(sent()).toEqual([]); // no checkpoint once stopped
    });
  });

  describe('what is not recorded', () => {
    it('anonymous users', () => {
      setup(null);
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(60);
      recorder.takeEnded(true);
      expect(sent()).toEqual([]);
      expect(localStorage.getItem(OUTBOX_KEY)).toBeNull();
    });

    it('less than 10 s of play', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(8);
      recorder.takeEnded(false);
      expect(sent()).toEqual([]);
    });

    it('a workbench with nothing on the stand, or a Stop without a Play', () => {
      setup();
      recorder.takeStarted(config());
      play(60);
      recorder.takeEnded(false);
      recorder.setItem(SCORE, 8);
      recorder.takeEnded(false);
      expect(sent()).toEqual([]);
    });
  });

  describe('when the page goes away', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => vi.unstubAllGlobals());

    it('pagehide sends the take in progress with a keepalive request', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(30);
      snapshot = counters(20, 20);
      window.dispatchEvent(new Event('pagehide'));

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/practice\/session\/[0-9a-f-]{36}$/);
      expect(init).toMatchObject({ method: 'PUT', keepalive: true, credentials: 'include' });
      expect(JSON.parse(init.body)).toMatchObject({ scoreId: 's1', activeSeconds: 30, notesExpected: 20, endReason: 'unloaded' });
    });

    it('a hidden page (tab switch, phone locked) saves too', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(30);
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      visibility.mockRestore();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).endReason).toBeUndefined();
    });
  });

  describe('outbox', () => {
    it('keeps the session until the server has it', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(false);

      const outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) as string);
      const [id] = Object.keys(outbox);
      expect(outbox[id]).toMatchObject({ userId: 'u1', session: { scoreId: 's1', activeSeconds: 20 } });

      sent(); // answered 200
      expect(localStorage.getItem(OUTBOX_KEY)).toBeNull();
    });

    it('offline: the session stays, and is sent on the next visit', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(false);
      const [request] = http.match(() => true);
      request.error(new ProgressEvent('error')); // status 0
      const id = request.request.url.split('/').pop();
      expect(Object.keys(JSON.parse(localStorage.getItem(OUTBOX_KEY) as string))).toEqual([id]);

      recorder.setItem(null);
      recorder.replayOutbox(); // what the next visit does on start
      const [replayed] = sent();
      expect(replayed.id).toBe(id);
      expect(replayed.body).toMatchObject({ scoreId: 's1', activeSeconds: 20 });
      expect(localStorage.getItem(OUTBOX_KEY)).toBeNull();
    });

    it('a session the server refuses is dropped, not retried for ever', () => {
      setup();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      play(20);
      recorder.takeEnded(false);
      http.match(() => true)[0].flush({}, { status: 400, statusText: 'Bad Request' });
      expect(localStorage.getItem(OUTBOX_KEY)).toBeNull();
    });

    it("does not send another user's sessions, and forgets those too old to be accepted", () => {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify({
        theirs: { userId: 'u2', savedAt: now, session: { kind: 'score' } },
        old: { userId: 'u1', savedAt: now - 8 * 24 * 3600_000, session: { kind: 'score' } },
        mine: { userId: 'u1', savedAt: now - 3600_000, session: { kind: 'score', scoreId: 's9' } },
      }));
      setup(); // replays on start

      expect(sent().map((r) => r.id)).toEqual(['mine']);
      expect(Object.keys(JSON.parse(localStorage.getItem(OUTBOX_KEY) as string))).toEqual(['theirs']);
    });
  });

  describe('for the coach (issue #414)', () => {
    it('publishes the take that just ended, and forgets it when another item is loaded', () => {
      setup();
      recorder.setItem(SCORE, 8);
      expect(recorder.lastTake()).toBeNull();
      recorder.takeStarted(config({ scoreRange: [3, 6], tempoFactor: 0.8, waitForLeftHand: false })); // measures 3 to 5
      snapshot = counters(20, 15, 5, 2);
      play(30);
      recorder.takeEnded(true);
      expect(recorder.lastTake()).toMatchObject({
        measureStart: 3, measureEnd: 5, completed: true, hands: 'right', tempoFactor: 0.8,
        notesExpected: 20, notesHit: 15, notesWrong: 5, waits: 2,
      });
      sent();

      recorder.setItem(EXERCISE, 4);
      expect(recorder.lastTake()).toBeNull();
    });

    it('gives the session in progress: totals, takes and weakest measures, without sending anything', () => {
      setup();
      expect(recorder.currentSessionSnapshot()).toBeNull();
      recorder.setItem(SCORE, 8);
      recorder.takeStarted(config());
      snapshot = {
        expected: 30, hit: 24, wrong: 2, onsets: 30, waits: 3, played: 26,
        measures: [
          { measure: 1, expected: 10, hit: 10, wrong: 0, onsets: 10, waits: 0 },
          { measure: 2, expected: 20, hit: 14, wrong: 2, onsets: 20, waits: 3 },
          { measure: 3, expected: 0, hit: 0, wrong: 0, onsets: 0, waits: 0 },
        ],
      };
      play(30);
      recorder.takeEnded(false);
      sent();

      const current = recorder.currentSessionSnapshot();
      expect(current?.item).toEqual({ kind: 'score', scoreId: 's1', title: 'Prelude' });
      expect(current?.takeCount).toBe(1);
      expect(current?.activeSeconds).toBe(30);
      expect(current?.totals.accuracy).toBeCloseTo(24 / 32);
      expect(current?.takes).toHaveLength(1);
      expect(current?.takes[0].accuracy).toBeCloseTo(24 / 32);
      expect(current?.weakMeasures.map(m => m.measure)).toEqual([2, 1]);
      expect(sent()).toHaveLength(0);
    });
  });
});
