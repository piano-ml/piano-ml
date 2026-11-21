import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { filter } from 'rxjs';
import { vi } from 'vitest';
import { PlayerControlService } from '../../desktop/service/player-control.service';
import { MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY } from '../../desktop/model/model';
import { CoachToolRegistry } from './tool-registry';
import { fakeWorkbench } from '../../testing/fake-workbench';

describe('selection tools', () => {
  let registry: CoachToolRegistry;
  let control: PlayerControlService;
  let router: Router;

  beforeEach(() => {
    localStorage.removeItem(MIDI_STORAGE_KEY);
    localStorage.removeItem(MUSIC_XML_STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    registry = TestBed.inject(CoachToolRegistry);
    control = TestBed.inject(PlayerControlService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(MIDI_STORAGE_KEY);
    localStorage.removeItem(MUSIC_XML_STORAGE_KEY);
  });

  /** Plays the workbench: registers a ready handle once the router reaches a matching path. */
  function workbenchOn(prefix: string, setup?: (wb: ReturnType<typeof fakeWorkbench>) => void) {
    const sub = router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      if ((e as NavigationEnd).urlAfterRedirects.startsWith(prefix)) {
        const wb = fakeWorkbench();
        setup?.(wb);
        control.register(wb.handle);
        sub.unsubscribe();
      }
    });
  }

  describe('list_exercises', () => {
    it('gives the scales, chords, exercises and keys with their stable keys', async () => {
      const result = await registry.call('list_exercises', {});
      const data = (result as { data: Record<string, { patternKey?: string; exerciseKey?: string; minor?: boolean }[]> }).data;
      expect(data['scales'].find(s => s.patternKey === 'major')?.minor).toBe(false);
      expect(data['scales'].find(s => s.patternKey === 'harmonic_minor')?.minor).toBe(true);
      expect(data['chords'].map(c => c.patternKey)).toContain('dominant 7');
      expect(data['scaleExercises'].map(e => e.exerciseKey)).toContain('left_than_right');
      expect(data['agilityExercises'].map(e => e.exerciseKey)).toEqual(['arpeggio_root_position', 'two_octave_arpeggios']);
      expect(data['majorKeys']).toContain('C');
      expect(data['minorKeys']).toContain('Am');
    });
  });

  describe('open_score', () => {
    it('opens the practice view of the score and waits until it is ready', async () => {
      workbenchOn('/work/prelude');
      const result = await registry.call('open_score', { slug: 'prelude' });
      expect(router.url).toBe('/work/prelude');
      expect(result).toMatchObject({ ok: true, data: { loaded: true } });
    });

    it('does nothing when the score is already open, and stops another score that was playing', async () => {
      await router.navigateByUrl('/work/prelude');
      const current = fakeWorkbench({ playing: true });
      control.register(current.handle);
      expect(await registry.call('open_score', { slug: 'prelude' })).toMatchObject({ ok: true });
      expect(current.handle.stop).not.toHaveBeenCalled();

      workbenchOn('/work/etude');
      await registry.call('open_score', { slug: 'etude' });
      expect(current.handle.stop).toHaveBeenCalled();
    });

    it('reports a load failure with the message the workbench shows', async () => {
      workbenchOn('/work/missing', wb => { wb.setReady(false); wb.setLoadError('This score or its files are not available.'); });
      const result = await registry.call('open_score', { slug: 'missing' });
      expect(result).toEqual({ ok: false, code: 'LOAD_FAILED', message: 'The score could not be opened: This score or its files are not available.' });
    });

    it('gives up after 45 seconds', async () => {
      vi.useFakeTimers();
      workbenchOn('/work/slow', wb => wb.setReady(false));
      const pending = registry.call('open_score', { slug: 'slow' });
      await vi.advanceTimersByTimeAsync(46_000);
      expect(await pending).toMatchObject({ ok: false, code: 'LOAD_TIMEOUT' });
    });
  });

  describe('open_exercise', () => {
    it('generates the exercise and opens it in the workbench', async () => {
      workbenchOn('/workbench/scale');
      const result = await registry.call('open_exercise', { type: 'scale', patternKey: 'major', tonic: 'g', exerciseKey: 'left_than_right' });
      expect(result).toMatchObject({ ok: true, data: { loaded: true } });
      expect(router.url).toMatch(/^\/workbench\/scale\/major\/G\/left_than_right/);
      expect(localStorage.getItem(MIDI_STORAGE_KEY)).not.toBeNull();
    });

    it('leaves the current workbench before writing the exercise (issue #413)', async () => {
      await router.navigateByUrl('/work/prelude');
      const current = fakeWorkbench({ playing: true });
      control.register(current.handle);
      let exerciseWrittenWhileOnScreen: boolean | null = null;
      // The old workbench goes away when the router leaves it; at that moment nothing must be written yet
      const sub = router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
        if ((e as NavigationEnd).urlAfterRedirects === '/exercises') {
          exerciseWrittenWhileOnScreen = localStorage.getItem(MIDI_STORAGE_KEY) != null;
          control.unregister(current.handle);
          sub.unsubscribe();
          workbenchOn('/workbench/agility');
        }
      });

      const result = await registry.call('open_exercise', { type: 'agility', patternKey: 'major', tonic: 'C', exerciseKey: 'two_octave_arpeggios' });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      expect(current.handle.stop).toHaveBeenCalled();
      expect(exerciseWrittenWhileOnScreen).toBe(false);
      expect(router.url).toMatch(/^\/workbench\/agility\//);
    });

    it('names the unknown argument and points to list_exercises', async () => {
      for (const [args, name] of [
        [{ type: 'scale', patternKey: 'nope', tonic: 'C', exerciseKey: 'left_than_right' }, 'patternKey'],
        [{ type: 'scale', patternKey: 'major', tonic: 'C', exerciseKey: 'nope' }, 'exerciseKey'],
        [{ type: 'scale', patternKey: 'major', tonic: 'Am', exerciseKey: 'left_than_right' }, 'tonic'],
        [{ type: 'agility', patternKey: 'major', tonic: 'Am', exerciseKey: 'two_octave_arpeggios' }, 'tonic'],
      ] as const) {
        const result = await registry.call('open_exercise', args);
        expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_EXERCISE' });
        expect((result as { message: string }).message).toContain(name);
        expect((result as { message: string }).message).toContain('list_exercises');
      }
    });

    it('accepts a minor key for a minor scale', async () => {
      workbenchOn('/workbench/scale');
      const result = await registry.call('open_exercise', { type: 'scale', patternKey: 'harmonic_minor', tonic: 'am', exerciseKey: 'left_than_right' });
      expect(result).toMatchObject({ ok: true });
    });

    it('reports a failure when the workbench sends the student back to the exercises page', async () => {
      const sub = router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
        if ((e as NavigationEnd).urlAfterRedirects.startsWith('/workbench/')) {
          sub.unsubscribe();
          void router.navigateByUrl('/exercises/scale/C/major/left_than_right');
        }
      });
      const result = await registry.call('open_exercise', { type: 'scale', patternKey: 'major', tonic: 'C', exerciseKey: 'left_than_right' });
      expect(result).toMatchObject({ ok: false, code: 'LOAD_FAILED' });
    });
  });

  describe('navigate', () => {
    it.each([
      [{ page: 'library' }, '/library'],
      [{ page: 'practice_summary' }, '/summary'],
      [{ page: 'exercises' }, '/exercises'],
      [{ page: 'connect' }, '/coach/connect'],
      [{ page: 'score_info', slug: 'prelude' }, '/score/prelude'],
      [{ page: 'composer', slug: 'bach' }, '/library/artists/bach'],
      [{ page: 'genre', slug: 'baroque' }, '/library/genres/baroque'],
    ])('%j shows %s', async (args, path) => {
      expect(await registry.call('navigate', args)).toEqual({ ok: true, data: { page: path } });
      expect(router.url).toBe(path);
    });

    it('needs a slug for the pages of one item, and refuses one that could leave them', async () => {
      expect(await registry.call('navigate', { page: 'score_info' })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
      expect(await registry.call('navigate', { page: 'composer', slug: 'a/b' })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
      expect(await registry.call('navigate', { page: 'genre', slug: 'a.b' })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
      expect(await registry.call('navigate', { page: 'admin' })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    });

    it('stops playback first', async () => {
      const wb = fakeWorkbench({ playing: true });
      control.register(wb.handle);
      await registry.call('navigate', { page: 'library' });
      expect(wb.handle.stop).toHaveBeenCalled();
    });
  });
});
