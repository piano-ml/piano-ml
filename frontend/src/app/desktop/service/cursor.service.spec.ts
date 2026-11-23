import { TestBed } from '@angular/core/testing';
import type { Note } from '@tonejs/midi/dist/Note';
import type { Cursor } from 'opensheetmusicdisplay';
import { DA_CAPO_AL_FINE_SCORE, DA_CAPO_VOLTA_SCORE, DOUBLE_BACK_JUMP_SCORE, MULTI_REPEAT_SCORE, PPQ, REPEAT_SCORE, SIMPLE_SCORE, VOLTA_DOUBLE_BACK_JUMP_SCORE, VOLTA_SCORE, type FixtureMeasure, playbackOrder, renderScore, scoreMidi } from '../../testing/score-fixture';
import { CURSOR_GOOD_COLOR } from '../components/osmd/osmd.config';
import { CursorService } from './cursor.service';

/**
 * The cursor service maps every MIDI onset (in ticks) to a cursor position in the OSMD score, so the cursor
 * can follow playback. These tests render real scores with OSMD in the test browser.
 */
describe('CursorService', () => {
  let service: CursorService;
  let rendered: Awaited<ReturnType<typeof renderScore>>;
  let cursor: Cursor;

  async function setup(measures: FixtureMeasure[], midi = scoreMidi(measures)) {
    rendered = await renderScore(measures);
    cursor = rendered.osmd.cursor;
    const slop = await service.setup(cursor, midi);
    return { slop, midi };
  }
  /** Pitch classes under the cursor, sorted. */
  const underCursor = () => [...new Set(cursor.NotesUnderCursor().filter((n) => n.Pitch).map((n) => n.Pitch.getHalfTone() % 12))].sort((a, b) => a - b);
  const tickOf = (bar: number, beat: number) => (bar * 4 + beat) * PPQ;
  const noteAt = (midi: { tracks: { notes: Note[] }[] }, ticks: number, track = 0) => midi.tracks[track].notes.find((n) => n.ticks === ticks)!;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CursorService);
  });
  afterEach(() => rendered?.dispose());

  describe('setup', () => {
    it('maps every MIDI onset to the score and reports a perfect match', async () => {
      const { slop } = await setup(SIMPLE_SCORE);
      expect(slop).toBe(0);
      expect(service.slopScoreSignal()).toBe(0);
      expect(service.feedbackSignal()).toBeNull(); // progress feedback cleared when done
      for (const ticks of service.sortedMidiTicks) {
        expect(service.midiTicksToOsmdCursorIndex.has(ticks), `tick ${ticks}`).toBe(true);
      }
      expect(cursor.CursorOptions.color).toBe(CURSOR_GOOD_COLOR);
    });

    it('puts each onset in its bar, with cursor positions in playing order', async () => {
      await setup(SIMPLE_SCORE);
      const links = service.sortedMidiTicks.map((t) => service.midiTicksToOsmdCursorIndex.get(t)!);
      expect(links.map((l) => l.osmdMeasure)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2]);
      const indexes = links.map((l) => l.osmdIndex);
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
      expect(new Set(indexes).size).toBe(indexes.length);
    });

    it('only attaches the pitches the score expects: wrong MIDI notes still map, and never count', async () => {
      // the MIDI plays C#3 instead of C3 in bar 1: the onset still maps (by the matching C5 above it)
      // NOTE: since only expected pitches are attached, verify() cannot find a mismatch: the slop score stays 0
      const midi = scoreMidi(SIMPLE_SCORE, (bar, hand, pitch) => (bar === 0 && hand === 'bass' ? pitch + 1 : pitch));
      const { slop } = await setup(SIMPLE_SCORE, midi);
      expect(service.midiTicksToOsmdCursorIndex.get(0)?.osmdMeasure).toBe(0);
      expect(slop).toBe(0);
    });

    it('follows repeats: the second pass maps onto the same bars', async () => {
      const { slop, midi } = await setup(REPEAT_SCORE);
      expect(slop).toBe(0);
      const first = service.midiTicksToOsmdCursorIndex.get(tickOf(0, 1))!; // bar 1, beat 2, first pass
      const second = service.midiTicksToOsmdCursorIndex.get(tickOf(2, 1))!; // same note, second pass
      expect(second.osmdMeasure).toBe(first.osmdMeasure);
      expect(service.midiTicksToOsmdCursorIndex.get(tickOf(4, 0))!.osmdMeasure).toBe(2); // last bar
      expect(midi.tracks[0].notes.length).toBe(19); // bars 1 2 1 2 3: 4+4+4+4+3 right-hand notes
    });

    it('maps every pass of every repeat onto its bar (three repeats, two of them adjacent)', async () => {
      const { slop } = await setup(MULTI_REPEAT_SCORE);
      expect(slop).toBe(0);
      playbackOrder(MULTI_REPEAT_SCORE).forEach((bar, played) => {
        expect(service.midiTicksToOsmdCursorIndex.get(tickOf(played, 0))?.osmdMeasure, `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('maps a section closed by two backward jumps: the second jump replays it once more', async () => {
      // Diabelli's Op. 151 Sonatina 1: m47 jumps back to m10 after the m26 repeat was already played;
      // the pass counter the section shared used to take only the first jump
      const { slop } = await setup(DOUBLE_BACK_JUMP_SCORE);
      expect(slop).toBe(0);
      const order = playbackOrder(DOUBLE_BACK_JUMP_SCORE);
      expect(order).toEqual([0, 1, 2, 1, 2, 3, 4, 1, 2, 3, 4, 5]);
      order.forEach((bar, played) => {
        expect(service.midiTicksToOsmdCursorIndex.get(tickOf(played, 0))?.osmdMeasure, `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('maps each pass onto the ending (volta) OSMD plays for it', async () => {
      const { slop } = await setup(VOLTA_SCORE);
      expect(slop).toBe(0);
      expect(playbackOrder(VOLTA_SCORE)).toEqual([0, 1, 2, 3, 1, 2, 4, 5]);
      playbackOrder(VOLTA_SCORE).forEach((bar, played) => {
        expect(service.midiTicksToOsmdCursorIndex.get(tickOf(played, 0))?.osmdMeasure, `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('maps a section with endings closed by a second :| (Diabelli): the third pass plays the second ending', async () => {
      const { slop } = await setup(VOLTA_DOUBLE_BACK_JUMP_SCORE);
      expect(slop).toBe(0);
      const order = playbackOrder(VOLTA_DOUBLE_BACK_JUMP_SCORE);
      expect(order).toEqual([0, 1, 2, 3, 1, 2, 4, 5, 1, 2, 4, 5, 6]);
      expect(service.measureSequence).toEqual(order);
      order.forEach((bar, played) => {
        expect(service.midiTicksToOsmdCursorIndex.get(tickOf(played, 0))?.osmdMeasure, `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('maps a D.C. al Fine: the Menuet again, without its repeat, up to the Fine', async () => {
      const { slop } = await setup(DA_CAPO_AL_FINE_SCORE);
      expect(slop).toBe(0);
      const order = playbackOrder(DA_CAPO_AL_FINE_SCORE);
      expect(order).toEqual([0, 1, 0, 1, 2, 3, 2, 3, 0, 1]);
      expect(service.measureSequence).toEqual(order);
      order.forEach((bar, played) => {
        expect(service.midiTicksToOsmdCursorIndex.get(tickOf(played, 0))?.osmdMeasure, `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('maps a D.C. al Fine over endings: after the D.C. the second ending is played', async () => {
      const { slop } = await setup(DA_CAPO_VOLTA_SCORE);
      expect(slop).toBe(0);
      const order = playbackOrder(DA_CAPO_VOLTA_SCORE);
      expect(order).toEqual([0, 1, 0, 2, 3, 0, 2]);
      expect(service.measureSequence).toEqual(order);
    });

  });

  describe('following playback (nextNote)', () => {
    it('moves the cursor to the played note and updates the bar', async () => {
      const { midi } = await setup(SIMPLE_SCORE);
      service.nextNote(noteAt(midi, tickOf(1, 2))); // B5, third beat of bar 2
      expect(underCursor()).toContain(11);
      expect(service.measure()).toBe(1);
      expect(cursor.CursorOptions.color).toBe(CURSOR_GOOD_COLOR);
      expect(cursor.CursorOptions.type).toBe(4);
    });

    it('draws the cursor once for a move over several steps, and not at all when it stays', async () => {
      const { midi } = await setup(SIMPLE_SCORE);
      const update = vi.spyOn(cursor, 'update');
      service.nextNote(noteAt(midi, tickOf(1, 2))); // several cursor steps ahead
      expect(update).toHaveBeenCalledTimes(1);
      expect(underCursor()).toContain(11);
      service.nextNote(noteAt(midi, tickOf(1, 2))); // same position
      expect(update).toHaveBeenCalledTimes(1);
      service.moveCursorToOsmdIndex(cursor, 0); // a seek back
      expect(update).toHaveBeenCalledTimes(2);
    });

    it('reset() draws the cursor once', async () => {
      await setup(SIMPLE_SCORE);
      const update = vi.spyOn(cursor, 'update');
      service.reset(2);
      expect(update).toHaveBeenCalledOnce();
    });

    it('when following, scrolls only once the cursor leaves the view', async () => {
      const { midi } = await setup(SIMPLE_SCORE);
      service.follow = true;
      const scroll = vi.spyOn(cursor.cursorElement, 'scrollIntoView').mockImplementation(() => undefined);
      const rect = vi.spyOn(cursor.cursorElement, 'getBoundingClientRect');
      const inView = { top: window.innerHeight / 2 - 20, bottom: window.innerHeight / 2 + 20, left: window.innerWidth / 2 - 5, right: window.innerWidth / 2 + 5 };
      rect.mockReturnValue(inView as DOMRect);
      service.nextNote(noteAt(midi, tickOf(1, 2)));
      expect(scroll).not.toHaveBeenCalled();
      rect.mockReturnValue({ ...inView, top: window.innerHeight - 30, bottom: window.innerHeight + 10 } as DOMRect);
      service.nextNote(noteAt(midi, tickOf(2, 0)));
      expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'center' });
    });

    it('scrolls the container that scrolls vertically, not the score wrapper that only scrolls sideways', async () => {
      // The workbench's layout: a short vertical scroller around a sideways-only wrapper as tall as the score
      const { midi } = await setup(SIMPLE_SCORE);
      const vertical = document.createElement('div');
      vertical.style.cssText = 'position: fixed; top: 0; left: 0; width: 1300px; height: 60px; overflow-y: auto;';
      const sideways = document.createElement('div');
      sideways.style.cssText = 'overflow-x: auto; overflow-y: hidden;';
      document.body.appendChild(vertical);
      vertical.appendChild(sideways);
      sideways.appendChild(rendered.host);
      cursor.show(); // visible, as in the workbench
      service.follow = true;
      const scroll = vi.spyOn(cursor.cursorElement, 'scrollIntoView').mockImplementation(() => undefined);
      service.nextNote(noteAt(midi, tickOf(2, 0))); // the cursor reaches below the 60 px the user sees
      expect(scroll).toHaveBeenCalled();
      vertical.remove();
    });

    it('can go back (seek, repeat)', async () => {
      const { midi } = await setup(SIMPLE_SCORE);
      service.nextNote(noteAt(midi, tickOf(2, 0)));
      service.nextNote(noteAt(midi, tickOf(0, 1)));
      expect(underCursor()).toContain(2); // D5
      expect(service.measure()).toBe(0);
    });

    it('jumps back to the repeated bar on the second pass', async () => {
      const { midi } = await setup(REPEAT_SCORE);
      service.nextNote(noteAt(midi, tickOf(1, 3))); // end of bar 2
      service.nextNote(noteAt(midi, tickOf(2, 0))); // repeat: bar 1 again
      expect(service.measure()).toBe(0);
      expect(underCursor()).toContain(0);
    });

    it('follows a whole playback with three repeats (two adjacent), each bar drawn exactly as often as it is played', async () => {
      // The regression (Watson's "Je te laisserai des mots"): OSMD's iterator jumped back at a repeat barline
      // on its own, mid-step, so the cursor swept the repeated bars a third time and stayed out of sync with
      // the audio from there on
      const { midi } = await setup(MULTI_REPEAT_SCORE);
      playbackOrder(MULTI_REPEAT_SCORE).forEach((bar, played) => {
        service.nextNote(noteAt(midi, tickOf(played, 0)));
        expect(cursor.iterator.CurrentMeasure.measureListIndex, `played bar ${played + 1}`).toBe(bar);
        expect(service.measure(), `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('follows a whole playback through a section closed by two backward jumps', async () => {
      const { midi } = await setup(DOUBLE_BACK_JUMP_SCORE);
      playbackOrder(DOUBLE_BACK_JUMP_SCORE).forEach((bar, played) => {
        service.nextNote(noteAt(midi, tickOf(played, 0)));
        expect(cursor.iterator.CurrentMeasure.measureListIndex, `played bar ${played + 1}`).toBe(bar);
        expect(service.measure(), `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('follows a whole playback through first and second endings', async () => {
      const { midi } = await setup(VOLTA_SCORE);
      playbackOrder(VOLTA_SCORE).forEach((bar, played) => {
        service.nextNote(noteAt(midi, tickOf(played, 0)));
        expect(cursor.iterator.CurrentMeasure.measureListIndex, `played bar ${played + 1}`).toBe(bar);
        expect(service.measure(), `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('follows a whole playback through the Diabelli shape (endings, then a second :|)', async () => {
      const { midi } = await setup(VOLTA_DOUBLE_BACK_JUMP_SCORE);
      playbackOrder(VOLTA_DOUBLE_BACK_JUMP_SCORE).forEach((bar, played) => {
        service.nextNote(noteAt(midi, tickOf(played, 0)));
        expect(cursor.iterator.CurrentMeasure.measureListIndex, `played bar ${played + 1}`).toBe(bar);
      });
    });

    it('follows a whole playback through a D.C. al Fine, and seeks back across the D.C.', async () => {
      const { midi } = await setup(DA_CAPO_AL_FINE_SCORE);
      const order = playbackOrder(DA_CAPO_AL_FINE_SCORE);
      order.forEach((bar, played) => {
        service.nextNote(noteAt(midi, tickOf(played, 0)));
        expect(cursor.iterator.CurrentMeasure.measureListIndex, `played bar ${played + 1}`).toBe(bar);
      });
      service.nextNote(noteAt(midi, tickOf(5, 2))); // back before the D.C.: bar 4, first pass of the Trio's repeat
      expect(cursor.iterator.CurrentMeasure.measureListIndex).toBe(3);
      for (let played = 6; played < order.length; played++) {
        service.nextNote(noteAt(midi, tickOf(played, 0)));
        expect(cursor.iterator.CurrentMeasure.measureListIndex, `played bar ${played + 1} after the seek`).toBe(order[played]);
      }
    });

    it('seeks back across a repeat it took and plays on from there in step with the audio', async () => {
      // OSMD moves back in source order without undoing its jumps: the service replays from the start
      const { midi } = await setup(VOLTA_SCORE);
      const order = playbackOrder(VOLTA_SCORE);
      service.nextNote(noteAt(midi, tickOf(6, 0))); // second ending, after the repeat
      service.nextNote(noteAt(midi, tickOf(2, 1))); // back to bar 3, first pass
      expect(cursor.iterator.CurrentMeasure.measureListIndex).toBe(2);
      for (let played = 3; played < order.length; played++) {
        service.nextNote(noteAt(midi, tickOf(played, 0)));
        expect(cursor.iterator.CurrentMeasure.measureListIndex, `played bar ${played + 1}`).toBe(order[played]);
      }
    });

    it('shows a measure-wide cursor when the note under it does not match', async () => {
      await setup(SIMPLE_SCORE);
      service.nextNote({ ticks: tickOf(0, 0), midi: 61 } as Note); // C# instead of C
      expect(cursor.CursorOptions.type).toBe(3);
    });

    it('ignores notes it cannot place', async () => {
      await setup(SIMPLE_SCORE);
      service.nextNote({ ticks: 12345, midi: 60 } as Note);
      expect(service.measure()).toBe(0);
      expect(cursor.iterator.CurrentMeasureIndex).toBe(0);
    });
  });

  describe('moving the cursor', () => {
    it('reset(start) puts the cursor at the start of bar start-1', async () => {
      const { midi } = await setup(SIMPLE_SCORE);
      service.nextNote(noteAt(midi, tickOf(2, 0)));
      service.reset(2);
      expect(cursor.iterator.CurrentMeasureIndex).toBe(1);
      service.reset();
      expect(cursor.iterator.CurrentMeasureIndex).toBe(0);
    });

    it('reset() without a score only rewinds the bar counter', () => {
      service.measure.set(3);
      service.reset(2);
      expect(service.measure()).toBe(0);
    });
  });

  /**
   * The played-measure sequence now comes from OSMD's own iterator (CursorIgnoreRepetitions = false): one
   * entry per measure pass, in the order the MIDI exports play them.
   */
  describe('measureSequence (from OSMD)', () => {
    it('plays a plain score straight through', async () => {
      await setup(SIMPLE_SCORE);
      expect(service.measureSequence).toEqual([0, 1, 2]);
    });

    it('takes each repeat once, adjacent repeats too', async () => {
      await setup(MULTI_REPEAT_SCORE);
      expect(service.measureSequence).toEqual(playbackOrder(MULTI_REPEAT_SCORE));
    });

    it('plays the first ending, then skips it for the second', async () => {
      await setup(VOLTA_SCORE);
      expect(service.measureSequence).toEqual([0, 1, 2, 3, 1, 2, 4, 5]);
    });

    it('a section closed by two backward jumps goes back to its forward repeat twice', async () => {
      await setup(DOUBLE_BACK_JUMP_SCORE);
      expect(service.measureSequence).toEqual(playbackOrder(DOUBLE_BACK_JUMP_SCORE));
    });
  });

  describe('session', () => {
    it('resetSession() forgets the score', async () => {
      await setup(SIMPLE_SCORE);
      service.resetSession();
      expect(service.midiTicksToOsmdCursorIndex.size).toBe(0);
      expect(service.sortedMidiTicks).toEqual([]);
      expect(service.cursor).toBeUndefined();
      expect([service.measure(), service.slopScoreSignal(), service.maxMidiMeasure]).toEqual([0, 0, 0]);
    });

    it('can set up a second score after a reset', async () => {
      await setup(SIMPLE_SCORE);
      rendered.dispose();
      service.resetSession();
      const { slop } = await setup(REPEAT_SCORE);
      expect(slop).toBe(0);
    });

    it('ngOnDestroy resets the session', async () => {
      await setup(SIMPLE_SCORE);
      service.ngOnDestroy();
      expect(service.midiTicksToOsmdCursorIndex.size).toBe(0);
    });

    it('tiltCursor() attaches a cursor', async () => {
      rendered = await renderScore(SIMPLE_SCORE);
      service.tiltCursor(rendered.osmd.cursor);
      expect(service.cursor).toBe(rendered.osmd.cursor);
    });
  });

  describe('options', () => {
    it('stores the alignment algorithm (sw2 by default)', () => {
      // NOTE: setup() no longer runs the Smith-Waterman alignment, so this setting currently has no effect
      expect(service.getAlignmentAlgorithm()).toBe('sw2');
      service.setAlignmentAlgorithm('sw1');
      expect(service.getAlignmentAlgorithm()).toBe('sw1');
    });


    it('reports progress as a whole percentage', () => {
      service.feedback('Building', 42.4);
      expect(service.feedbackSignal()).toEqual({ message: 'Building', percentage: 42 });
    });
  });
});
