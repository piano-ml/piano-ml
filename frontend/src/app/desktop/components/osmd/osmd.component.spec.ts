import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideTesting } from '../../../testing/test-providers';
import { SIMPLE_SCORE, scoreXml } from '../../../testing/score-fixture';
import { PlayerService } from '../../service/player.service';
import { OsmdComponent } from './osmd.component';

/** Polls until `condition` holds (OSMD renders and sets up asynchronously, on real timers). */
async function waitFor(condition: () => boolean, timeout = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('OsmdComponent', () => {
  let fixture: ComponentFixture<OsmdComponent>;
  let component: OsmdComponent;
  let player: { setOsmd: ReturnType<typeof vi.fn>; tiltCursor: ReturnType<typeof vi.fn>; releaseScoreSession: ReturnType<typeof vi.fn> };
  let loading: boolean[];

  function create(musicXml: string | null = scoreXml(SIMPLE_SCORE), platform = 'browser') {
    TestBed.configureTestingModule({
      imports: [OsmdComponent],
      providers: [...provideTesting(), { provide: PlayerService, useValue: player }, { provide: PLATFORM_ID, useValue: platform }],
    });
    fixture = TestBed.createComponent(OsmdComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('musicXml', musicXml);
    loading = [];
    component.loadingChange.subscribe((l) => loading.push(l));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const loaded = () => waitFor(() => loading.at(-1) === false);

  beforeEach(() => {
    for (const key of ['hideFingering', 'hideLyrics', 'hideFingeringAndHarmony', 'cursorService.debug']) localStorage.removeItem(key);
    player = { setOsmd: vi.fn(async () => 0), tiltCursor: vi.fn(), releaseScoreSession: vi.fn() };
  });
  afterEach(() => fixture?.destroy());

  describe('loading a score', () => {
    it('renders the MusicXML as SVG and reports loading, then done', async () => {
      const el = create();
      expect(loading).toEqual([true]);
      await loaded();
      expect(el.querySelector('svg')).not.toBeNull();
      expect(component.loading).toBe(false);
      expect(component.error).toBeNull();
    });

    it('hands the rendered score to the player and shows the cursor at the start', async () => {
      create();
      await loaded();
      expect(player.setOsmd).toHaveBeenCalledWith(component.osmd);
      const cursor = component.osmd!.cursors[0];
      expect(cursor.hidden).toBe(false);
      expect(cursor.SkipInvisibleNotes).toBe(true);
      expect(cursor.iterator.CurrentMeasureIndex).toBe(0);
    });

    it('keeps reporting loading without MusicXML', () => {
      create(null);
      expect(loading).toEqual([true]);
      expect(component.loading).toBe(true);
      expect(player.setOsmd).not.toHaveBeenCalled();
    });

    it('does nothing during server-side rendering', () => {
      const el = create(scoreXml(SIMPLE_SCORE), 'server');
      expect(component.osmd).toBeNull();
      expect(loading).toEqual([]);
      expect(el.querySelector('svg')).toBeNull();
    });
  });

  describe('display options (from the MIDI setup dialog, kept in localStorage)', () => {
    it('draws fingering and lyrics by default', () => {
      create(null);
      expect(component.getCustomOptions()).toEqual({ drawFingerings: true, drawLyrics: true });
    });

    it('hides fingering and lyrics when asked', () => {
      localStorage.setItem('hideFingering', 'true');
      localStorage.setItem('hideLyrics', 'true');
      create(null);
      expect(component.getCustomOptions()).toEqual({ drawFingerings: false, drawLyrics: false });
      expect(component.osmd!.EngravingRules.RenderFingerings).toBe(false);
    });

    it('hides every text of the score (fingering and harmony) when asked', async () => {
      localStorage.setItem('hideFingeringAndHarmony', 'true');
      const el = create();
      await loaded();
      const texts = [...el.querySelectorAll<HTMLElement>('.vf-text')];
      expect(texts.every((t) => t.style.display === 'none')).toBe(true);
    });

    it.each([
      ['true', true], ['false', false], ['"yes"', 'yes'], ['not json', false], [null, false],
    ])('parseBooleanStorage reads %j as %j', (stored, expected) => {
      if (stored === null) localStorage.removeItem('hideLyrics');
      else localStorage.setItem('hideLyrics', stored);
      create(null);
      expect(component.parseBooleanStorage('hideLyrics')).toBe(expected);
    });
  });

  describe('cursor', () => {
    it('sizes the cursor to cover both staves and attaches it to the player', async () => {
      create();
      await loaded();
      await waitFor(() => player.tiltCursor.mock.calls.length > 0, 3000);
      const cursorImage = document.getElementById('cursorImg-0')!;
      expect(Number.parseFloat(cursorImage.style.height)).toBeGreaterThan(50);
      expect(player.tiltCursor).toHaveBeenCalledWith(component.osmd!.Cursor);
    });

    it('resizes the cursor again when the window is resized', async () => {
      create();
      await loaded();
      await waitFor(() => player.tiltCursor.mock.calls.length > 0, 3000);
      player.tiltCursor.mockClear();
      window.dispatchEvent(new Event('resize'));
      await waitFor(() => player.tiltCursor.mock.calls.length > 0, 3000);
    });

    it('does nothing before a score is rendered', () => {
      vi.useFakeTimers();
      create(null);
      component.osmd = null;
      component.recalculateCursorPosition();
      vi.advanceTimersByTime(1000);
      expect(player.tiltCursor).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('destroy', () => {
    it('clears the score and releases the player session', async () => {
      const el = create();
      await loaded();
      fixture.destroy();
      expect(component.osmd).toBeNull();
      expect(player.releaseScoreSession).toHaveBeenCalled();
      expect(el.querySelector('svg')).toBeNull();
    });

    it('logs its lifecycle in debug mode', async () => {
      localStorage.setItem('cursorService.debug', '1');
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      create(null);
      fixture.destroy();
      expect(log).toHaveBeenCalledWith('[osmd][lifecycle] destroy:start', expect.any(Object));
      expect(log).toHaveBeenCalledWith('[osmd][lifecycle] destroy:end', expect.any(Object));
    });
  });
});
