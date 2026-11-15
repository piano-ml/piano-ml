import { TestBed } from '@angular/core/testing';
import type { Note } from '@tonejs/midi/dist/Note';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { CursorService } from './cursor.service';
import { GOOD_RANGE, PlayerAssessService } from './player-assess.service';

/**
 * The assessment compares what the score expects (learnExpectation, fed by the player as notes become due)
 * with what the user plays (getNewActual, fed by MIDI input). While a due note is unplayed, playback waits.
 */
describe('PlayerAssessService', () => {
  let assess: PlayerAssessService;
  let cursor: { audioTimeNoteArray: Map<number, { pitch: number; hit: boolean }[]>; midiTicksToOsmdCursorIndex: Map<number, number> };

  /** A score note at `ticks` (only notes the cursor knows can be expected). */
  const note = (midi: number, ticks = 0) => ({ midi, ticks }) as Note;
  const played = (midi: number, time = 0) => ({ note: midi, time, type: 'down' }) as unknown as MidiStateEvent;

  beforeEach(() => {
    cursor = { audioTimeNoteArray: new Map(), midiTicksToOsmdCursorIndex: new Map([[0, 0], [480, 1], [960, 2]]) };
    TestBed.configureTestingModule({ providers: [{ provide: CursorService, useValue: cursor }] });
    assess = TestBed.inject(PlayerAssessService);
    assess.reset();
  });

  describe('expectations', () => {
    it('waits for a due note, and counts the wait as late once', () => {
      const status = assess.learnExpectation(1, 1.5, note(60), 'rh');
      expect(status.shouldPause).toBe(true);
      expect(status.late).toBe(1);
      expect([...status.expectations.get(1)!]).toEqual([{ hand: 'rh', midi: 60 }]);

      assess.learnExpectation(1, 1.5, note(64), 'rh'); // still waiting: not a new wait
      expect(assess.getExpectation().late).toBe(1);
    });

    it('does not expect the same note of the same hand twice', () => {
      assess.learnExpectation(1, 2, note(60), 'rh');
      assess.learnExpectation(1, 2, note(60), 'rh');
      assess.learnExpectation(1, 2, note(60), 'lh'); // other hand: a different expectation
      expect(assess.liveStatus.expectations.get(1)!.size).toBe(2);
    });

    it('ignores notes the cursor cannot show', () => {
      const status = assess.learnExpectation(1, 2, note(60, 123), 'rh');
      expect(status.expectations.size).toBe(0);
      expect(status.shouldPause).toBe(false);
    });
  });

  describe('playing', () => {
    it('a right note satisfies the expectation and resumes playback', () => {
      assess.learnExpectation(1, 2, note(60), 'rh');
      const status = assess.getNewActual(1, played(60))!;
      expect(status.bad).toBeNull();
      expect(status.shouldPause).toBe(false);
      expect(status.badCount).toBe(0);
    });

    it('a chord needs all its notes', () => {
      assess.learnExpectation(1, 2, note(60), 'rh');
      assess.learnExpectation(1, 2, note(64), 'rh');
      expect(assess.getNewActual(1, played(60))!.shouldPause).toBe(true);
      expect(assess.getNewActual(1, played(64))!.shouldPause).toBe(false);
    });

    it('the oldest due notes must be played first', () => {
      assess.learnExpectation(1, 2, note(60), 'rh');
      assess.learnExpectation(2, 3, note(62, 480), 'rh');
      const status = assess.getNewActual(2, played(62))!; // the later note first: wrong
      expect(status.bad).toBe(62);
      expect(status.expectations.size).toBe(2);

      assess.getNewActual(2, played(60));
      assess.getNewActual(2, played(62));
      expect(assess.getExpectation().shouldPause).toBe(false);
    });

    it('a wrong note is counted, reported, and kept as an early note', () => {
      assess.learnExpectation(1, 2, note(60), 'rh');
      const status = assess.getNewActual(1.2, played(61, 1.2))!;
      expect(status.bad).toBe(61);
      expect(status.badCount).toBe(1);
      expect(status.shouldPause).toBe(true);
      expect([...status.early.get(1.2)!]).toEqual([{ hand: 'rh', midi: 61 }]);

      assess.getNewActual(1.3, played(60, 1.3));
      expect(assess.liveStatus.bad).toBeNull(); // cleared by the next note
    });

    it('a note played slightly early counts once it becomes due', () => {
      assess.getNewActual(0.9, played(60, 0.9)); // nothing expected yet
      const status = assess.learnExpectation(1, 2, note(60), 'rh');
      expect(status.shouldPause).toBe(false);
      expect(status.early.size).toBe(0);
    });

    it('forgets early notes played too long before', () => {
      assess.getNewActual(0, played(60, 0));
      const status = assess.learnExpectation(GOOD_RANGE + 1, GOOD_RANGE + 2, note(60), 'rh');
      expect(status.shouldPause).toBe(true); // the old early note no longer counts
      expect(status.early.size).toBe(0);
    });

    it('does not register the same early note twice', () => {
      assess.getNewActual(0, played(61, 0.5));
      assess.getNewActual(0, played(61, 0.5));
      expect(assess.liveStatus.early.get(0.5)!.size).toBe(1);
      expect(assess.liveStatus.badCount).toBe(2);
    });
  });

  describe('timing window (isNoteInTime)', () => {
    beforeEach(() => {
      cursor.audioTimeNoteArray = new Map([
        [1, [{ pitch: 60, hit: false }]],
        [2, [{ pitch: 62, hit: false }, { pitch: 65, hit: true }]],
        [5, [{ pitch: 67, hit: false }]],
      ]);
      assess.reset();
    });

    it('lists the unplayed notes due within the window', () => {
      expect(assess.getNotesInRange(1.5, GOOD_RANGE).map((n) => n.pitch)).toEqual([60, 62]);
      expect(assess.getNotesInRange(5, 0.1).map((n) => n.pitch)).toEqual([67]);
      expect(assess.getNotesInRange(3.5, 0.5)).toEqual([]);
    });

    it('accepts a note played within the window, once', () => {
      expect(assess.isNoteInTime(played(60), 1.2)).toBe(true);
      expect(assess.isNoteInTime(played(60), 1.2)).toBe(false); // already hit
      expect(assess.getNotesInRange(1, 0.1)).toEqual([]);
    });

    it('rejects a note outside the window or not in the score', () => {
      expect(assess.isNoteInTime(played(67), 1)).toBe(false); // due at 5
      expect(assess.isNoteInTime(played(61), 1)).toBe(false);
      expect(assess.isNoteInTime(played(65), 2)).toBe(false); // already hit before
    });
  });

  it('reset() starts a fresh assessment', () => {
    assess.learnExpectation(1, 2, note(60), 'rh');
    assess.getNewActual(1, played(61, 1));
    assess.reset();
    expect(assess.liveStatus).toEqual({
      shouldPause: false, expectations: new Map(), early: new Map(), bad: null, total: 0, badCount: 0, late: 0,
    });
  });

  it('releases everything when destroyed', () => {
    assess.learnExpectation(1, 2, note(60), 'rh');
    assess.getNewActual(1, played(61, 1));
    assess.ngOnDestroy();
    expect(assess.liveStatus.expectations.size).toBe(0);
    expect(assess.liveStatus.early.size).toBe(0);
  });

  describe('counters of a take (snapshot)', () => {
    let clock: number;
    /** A score note in the 1-based `measure` (480 ticks per measure in this fixture). */
    const inMeasure = (midi: number, measure: number, ticks = 0) => ({ midi, ticks, bars: measure - 1 + 0.25 }) as Note;

    beforeEach(() => {
      clock = 1_000_000;
      vi.spyOn(assess as unknown as { now(): number }, 'now').mockImplementation(() => clock);
    });

    it('starts empty', () => {
      expect(assess.snapshot()).toEqual({ expected: 0, hit: 0, wrong: 0, onsets: 0, waits: 0, measures: [] });
    });

    it('a perfect take: every expected note hit, no wrong note, no wait', () => {
      assess.learnExpectation(1, 2, inMeasure(60, 1), 'rh');
      assess.learnExpectation(1, 2, inMeasure(64, 1), 'rh'); // same onset: a chord
      assess.getNewActual(1, played(60));
      assess.getNewActual(1, played(64));
      assess.learnExpectation(2, 3, inMeasure(62, 2, 480), 'rh');
      assess.getNewActual(2, played(62));

      expect(assess.snapshot()).toEqual({
        expected: 3, hit: 3, wrong: 0, onsets: 2, waits: 0,
        measures: [
          { measure: 1, expected: 2, hit: 2, wrong: 0, onsets: 1, waits: 0 },
          { measure: 2, expected: 1, hit: 1, wrong: 0, onsets: 1, waits: 0 },
        ],
      });
      expect(assess.liveStatus.total).toBe(3);
    });

    it('a wrong note is counted in the measure being waited for', () => {
      assess.learnExpectation(1, 2, inMeasure(60, 3), 'rh');
      assess.getNewActual(1, played(61, 1));
      assess.getNewActual(1, played(60, 1.1));

      expect(assess.snapshot()).toMatchObject({ expected: 1, hit: 1, wrong: 1 });
      expect(assess.snapshot().measures).toEqual([{ measure: 3, expected: 1, hit: 1, wrong: 1, onsets: 1, waits: 0 }]);
    });

    it('a note played ahead of the score is not wrong once it is matched', () => {
      assess.getNewActual(0.9, played(60, 0.9)); // nothing expected yet: counted wrong for now
      expect(assess.snapshot().wrong).toBe(1);

      assess.learnExpectation(1, 2, inMeasure(60, 1), 'rh');

      expect(assess.snapshot()).toMatchObject({ expected: 1, hit: 1, wrong: 0, onsets: 1, waits: 0 });
    });

    it('an onset completed after GOOD_RANGE is a wait; a quick one is not', () => {
      assess.learnExpectation(1, 2, inMeasure(60, 1), 'rh');
      clock += GOOD_RANGE * 1000 - 1;
      assess.getNewActual(1, played(60));
      assess.learnExpectation(2, 3, inMeasure(62, 2, 480), 'rh');
      clock += GOOD_RANGE * 1000 + 1;
      assess.getNewActual(2, played(62));

      expect(assess.snapshot()).toMatchObject({ onsets: 2, waits: 1 });
      expect(assess.snapshot().measures.map((m) => m.waits)).toEqual([0, 1]);
    });

    it('a note still awaited is expected but not hit', () => {
      assess.learnExpectation(1, 2, inMeasure(60, 1), 'rh');
      expect(assess.snapshot()).toMatchObject({ expected: 1, hit: 0, onsets: 1, waits: 0 });
    });

    it('one hand only: the other hand is never expected', () => {
      assess.learnExpectation(1, 2, inMeasure(48, 1), 'lh');
      assess.getNewActual(1, played(48));
      expect(assess.snapshot()).toMatchObject({ expected: 1, hit: 1 });
    });

    it('is a copy, and reset() starts a new take', () => {
      assess.learnExpectation(1, 2, inMeasure(60, 1), 'rh');
      const before = assess.snapshot();
      assess.getNewActual(1, played(60));
      expect(before.hit).toBe(0);

      assess.reset();
      expect(assess.snapshot()).toEqual({ expected: 0, hit: 0, wrong: 0, onsets: 0, waits: 0, measures: [] });
    });
  });
});
