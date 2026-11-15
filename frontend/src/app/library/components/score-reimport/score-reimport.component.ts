import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Midi, type Track } from '@tonejs/midi';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';
import { ScoreApiInfo, ScoreService } from '../../../core/api';
import { defaultStudyTracks, inHandOrder } from '../../../import/components/import-work/study-tracks';

/** A track of the original MIDI file that can be studied: its index in the file (what the backend counts) and the track. */
export interface ReimportTrack {
  index: number;
  track: Track;
}

/**
 * /score/:slug/reimport — owners and admins pick the study tracks of a MIDI score again: the file uploaded at
 * import (ori.midi) is read here to list its tracks, then the backend packs it again under the same score
 * (same id, slug, owner).
 */
@Component({
  selector: 'app-score-reimport',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './score-reimport.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreReimportComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scoreService = inject(ScoreService);
  private readonly authService = inject(AuthService);

  readonly slug = signal<string | null>(null);
  readonly score = signal<ScoreApiInfo | null>(null);
  /** Reading the score and its original file. */
  readonly loading = signal(true);
  /** Sending the re-import: the backend converts the file again, which can take a minute. */
  readonly importing = signal(false);
  /** Why the page cannot offer a re-import (not allowed, not a MIDI score, ...). */
  readonly error = signal<string | null>(null);
  /** Why the last re-import failed: the track choice stays on screen to try again. */
  readonly importError = signal<string | null>(null);
  readonly midi = signal<Midi | null>(null);
  /** Tracks with notes, in file order. */
  readonly tracks = signal<ReimportTrack[]>([]);
  /** Chosen study tracks, as indexes in the file. */
  readonly selected = signal<number[]>([]);
  readonly makeFingering = signal(true);

  /** The chosen tracks as the backend wants them: right hand (higher pitch) first. */
  readonly studies = computed(() => inHandOrder(this.midi()?.tracks ?? [], this.selected()));

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    this.slug.set(slug);
    if (!slug) {
      this.fail('No score slug provided.');
      return;
    }
    void this.load(slug);
  }

  private fail(message: string) {
    this.error.set(message);
    this.loading.set(false);
  }

  private isOwnerOrAdmin(score: ScoreApiInfo): boolean {
    const userId = this.authService.getUserId();
    return this.authService.isAdmin() || !!(userId && score.owner_id && userId === score.owner_id);
  }

  private async load(slug: string) {
    let score: ScoreApiInfo;
    try {
      score = await firstValueFrom(this.scoreService.scoreGetBySlug(slug));
    } catch (e) {
      this.fail((e as HttpErrorResponse)?.status === 404 ? 'This score does not exist.' : 'Could not load the score.');
      return;
    }
    this.score.set(score);
    if (!this.isOwnerOrAdmin(score)) {
      this.fail('Only the owner of this score and admins can re-import it.');
      return;
    }
    if (!score.owner_id || !score.id || !score.version) {
      this.fail('This score is missing information.');
      return;
    }
    let blob: Blob | null;
    let contentType: string;
    try {
      const response = await firstValueFrom(
        this.scoreService.scoreOwnerIdTypeVersionRevisionGet(score.owner_id, score.id, 'original', score.version, 1, 'response'));
      blob = response.body;
      contentType = (blob?.type || response.headers?.get('Content-Type') || '').toLowerCase();
    } catch (e) {
      this.fail((e as HttpErrorResponse)?.status === 404
        ? 'The original file of this score is not available: it cannot be re-imported.'
        : 'Could not download the original file of this score.');
      return;
    }
    if (!blob || !contentType.startsWith('audio/midi')) {
      this.fail('Only scores imported from a MIDI file can be re-imported.');
      return;
    }
    try {
      this.showTracks(new Midi(await blob.arrayBuffer()), score.study_tracks ?? []);
    } catch (e) {
      console.error('Error reading the original MIDI file:', e);
      this.fail('The original MIDI file cannot be read.');
      return;
    }
    this.loading.set(false);
  }

  /** Lists the tracks with notes and checks the current study tracks (the default choice when they no longer fit). */
  private showTracks(midi: Midi, current: number[]) {
    const tracks = midi.tracks.map((track, index) => ({ index, track })).filter(({ track }) => track.notes.length > 0);
    const studiable = new Set(tracks.filter(({ track }) => !track.instrument.percussion).map(({ index }) => index));
    const keepCurrent = current.length > 0 && current.length <= 2 && current.every((i) => studiable.has(i));
    this.midi.set(midi);
    this.tracks.set(tracks);
    this.selected.set(keepCurrent ? [...current] : defaultStudyTracks(midi.tracks));
  }

  isSelected(index: number): boolean {
    return this.selected().includes(index);
  }

  /** Drums cannot be studied, and two tracks at most (one per hand): the others are locked once two are chosen. */
  isLocked(row: ReimportTrack): boolean {
    return row.track.instrument.percussion || (!this.isSelected(row.index) && this.selected().length >= 2);
  }

  toggle(row: ReimportTrack) {
    if (this.isSelected(row.index)) {
      this.selected.update((s) => s.filter((i) => i !== row.index));
    } else if (!this.isLocked(row)) {
      this.selected.update((s) => [...s, row.index]);
    }
  }

  /** Hand a chosen track will be practised with: the higher-pitched one is the right hand. */
  handOf(index: number): string {
    const studies = this.studies();
    const position = studies.indexOf(index);
    if (position < 0) return '';
    if (studies.length === 1) return 'Both hands';
    return position === 0 ? 'Right hand' : 'Left hand';
  }

  toggleFingering() {
    this.makeFingering.update((v) => !v);
  }

  reimport() {
    const score = this.score();
    const studies = this.studies();
    if (!score?.id || studies.length === 0 || this.importing()) {
      return;
    }
    this.importing.set(true);
    this.importError.set(null);
    this.scoreService.scoreIdReimportPost(score.id, { study_tracks: studies, make_fingering: this.makeFingering() }).subscribe({
      next: (updated) => {
        // Keep the progress message until the score page opens
        this.router.navigate(['/score', updated.immutableSlug || this.slug()]);
      },
      error: (e: HttpErrorResponse) => {
        console.error('Error re-importing the score:', e);
        this.importing.set(false);
        this.importError.set(e?.status === 400
          ? 'The server refused these tracks, or the original file is not a MIDI file.'
          : 'The re-import failed. The score is unchanged: please try again.');
      },
    });
  }
}
