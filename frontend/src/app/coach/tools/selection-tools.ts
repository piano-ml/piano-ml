import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { chords, majorKeys, minorKeys, scales, type Chord, type Scale } from '../../desktop/service/music-theory';
import { PlayerControlService } from '../../desktop/service/player-control.service';
import { loadExercice, normalizeKey } from '../../exercises/exercices';
import type { Exercise } from '../../exercises/model';
import { exercises as scaleExercises } from '../../exercises/scales/pattern';
import { exercises as agilityExercises } from '../../exercises/agility/pattern';
import { type ToolArgs, ToolError } from './tool';
import { pollUntil } from './wait';

/** How long a score or an exercise may take to load (the server waits a little longer). */
export const LOAD_TIMEOUT_MS = 45_000;
/** How long the previous workbench may take to go away before an exercise is written. */
const LEAVE_TIMEOUT_MS = 5_000;

const pathOf = (url: string) => url.split(/[?#]/)[0];

/** The key the practice history stores for a scale or a chord (saveExerciseToStorage). */
export const patternKeyOf = (pattern: Scale | Chord) => pattern.key ?? normalizeKey(pattern.name);
/** A minor scale offers the minor keys, as on the scales page. */
export const isMinorScale = (scale: Scale) => (scale.key ?? '').includes('minor');

/**
 * The selection tools (coach, issue #414): list_exercises, open_score, open_exercise, navigate. They act through
 * the router and the workbench's remote control only.
 */
@Injectable({ providedIn: 'root' })
export class SelectionTools {
  private readonly router = inject(Router);
  private readonly control = inject(PlayerControlService);

  listExercises(): unknown {
    return {
      scales: scales.map(s => ({ patternKey: patternKeyOf(s), name: s.name, minor: isMinorScale(s) })),
      scaleExercises: (scaleExercises as Exercise[]).map(e => ({ exerciseKey: e.key ?? normalizeKey(e.title), title: e.title })),
      chords: chords.map(c => ({ patternKey: patternKeyOf(c), name: c.name })),
      agilityExercises: (agilityExercises as Exercise[]).map(e => ({ exerciseKey: e.key ?? normalizeKey(e.title), title: e.title })),
      majorKeys: [...majorKeys],
      minorKeys: [...minorKeys],
    };
  }

  async openScore(args: ToolArgs): Promise<unknown> {
    const slug = String(args['slug']);
    const target = `/work/${slug}`;
    if (pathOf(this.router.url) === target && this.control.handle()?.isReady()) {
      return this.control.state();
    }
    this.stopIfPlaying();
    await this.router.navigate(['/work', slug]);
    return this.waitForLoad(path => path === target);
  }

  async openExercise(args: ToolArgs): Promise<unknown> {
    const type = String(args['type']);
    const patternKey = String(args['patternKey']);
    const exerciseKey = String(args['exerciseKey']);
    const tonic = String(args['tonic']);
    const unknown = (argument: string) =>
      new ToolError('UNKNOWN_EXERCISE', `Unknown ${argument}. Call list_exercises to get the valid values.`);

    const pattern: Scale | Chord | undefined = type === 'scale'
      ? scales.find(s => patternKeyOf(s) === patternKey)
      : chords.find(c => patternKeyOf(c) === patternKey);
    if (!pattern) throw unknown('patternKey');
    const exercise = ((type === 'scale' ? scaleExercises : agilityExercises) as Exercise[])
      .find(e => (e.key ?? normalizeKey(e.title)) === exerciseKey);
    if (!exercise) throw unknown('exerciseKey');
    const keys = type === 'scale' && isMinorScale(pattern as Scale) ? minorKeys : majorKeys;
    const key = keys.find(k => k.toLowerCase() === tonic.toLowerCase());
    if (!key) throw unknown('tonic');

    // The workbench being left deletes the generated exercise from localStorage (issue #413):
    // leave it first, then write the exercise.
    if (this.control.handle()) {
      this.stopIfPlaying();
      await this.router.navigateByUrl('/exercises');
      await pollUntil(() => this.control.handle() == null, LEAVE_TIMEOUT_MS);
    }
    loadExercice(this.router, exercise, pattern, key);
    return this.waitForLoad(path => path.startsWith('/workbench/'), path => path.startsWith('/exercises'));
  }

  async navigate(args: ToolArgs): Promise<unknown> {
    const page = String(args['page']);
    const slug = args['slug'] == null ? null : String(args['slug']);
    const needsSlug = page === 'score_info' || page === 'composer' || page === 'genre';
    if (needsSlug && !slug) {
      throw new ToolError('INVALID_ARGUMENT', `The page ${page} needs a slug.`);
    }
    const paths: Record<string, string> = {
      library: '/library',
      practice_summary: '/summary',
      exercises: '/exercises',
      score_info: `/score/${slug}`,
      composer: `/library/artists/${slug}`,
      genre: `/library/genres/${slug}`,
      connect: '/coach/connect',
    };
    this.stopIfPlaying();
    await this.router.navigateByUrl(paths[page]);
    return { page: pathOf(this.router.url) };
  }

  private stopIfPlaying(): void {
    const handle = this.control.handle();
    if (handle && this.control.state().playing) {
      handle.stop();
    }
  }

  /** Waits until the expected page shows a ready workbench; LOAD_FAILED or LOAD_TIMEOUT otherwise. */
  private async waitForLoad(isTarget: (path: string) => boolean, isFallback?: (path: string) => boolean): Promise<unknown> {
    let failed: string | null = null;
    let fellBack = false;
    let reached = isTarget(pathOf(this.router.url));
    // Navigation events, not only polling: a workbench that bounces back can leave the target within a poll
    const visits = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => { reached = reached || isTarget(pathOf(e.urlAfterRedirects)); });
    const settled = await pollUntil(() => {
      const path = pathOf(this.router.url);
      // A fallback only counts once the target was reached: right after a navigation starts, the router is
      // still on the page it leaves (for an exercise, /exercises itself)
      if (reached && isFallback?.(path)) {
        fellBack = true;
        return true;
      }
      reached = reached || isTarget(path);
      const handle = this.control.handle();
      failed = isTarget(path) ? handle?.getLoadError() ?? null : null;
      return isTarget(path) && (failed != null || handle?.isReady() === true);
    }, LOAD_TIMEOUT_MS).finally(() => visits.unsubscribe());
    if (fellBack) {
      throw new ToolError('LOAD_FAILED', 'The exercise could not be opened. Call open_exercise again.');
    }
    if (failed) {
      throw new ToolError('LOAD_FAILED', `The score could not be opened: ${failed}`);
    }
    if (!settled) {
      throw new ToolError('LOAD_TIMEOUT', 'The page is still loading. Call get_player_state in a moment.');
    }
    return this.control.state();
  }
}
