import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  bootstrapArrowLeft, bootstrapGripVertical, bootstrapPencil, bootstrapTrash, bootstrapX,
} from '@ng-icons/bootstrap-icons';
import { HttpErrorResponse } from '@angular/common/http';
import { PlaylistDetail, PlaylistItem, PlaylistService } from '../../../core/api';
import { ToastService } from '../../../shared/services/toast.service';
import { PlaylistStore, playlistTitle } from '../../services/playlist-store.service';
import { relativeTime, scorePath, shortDate } from './playlist-format';

/** Reorders sent this long after the last move, as one request. */
export const ORDER_SAVE_DELAY_MS = 600;

/**
 * One of the user's playlists (issue #278): edit its title and description, delete it, reorder its scores
 * (drag and drop, Alt+↑/↓) and remove them, after a confirmation, with Undo. The URL uses the playlist's slug, which never
 * changes, so it survives a rename.
 */
@Component({
  selector: 'app-playlist-detail',
  imports: [DecimalPipe, FormsModule, RouterLink, NgIcon, CdkDropList, CdkDrag, CdkDragHandle],
  viewProviders: [provideIcons({
    bootstrapArrowLeft, bootstrapGripVertical, bootstrapPencil, bootstrapTrash, bootstrapX,
  })],
  templateUrl: './playlist-detail.component.html',
  styleUrl: './playlists.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistDetailComponent implements OnInit {
  private readonly api = inject(PlaylistService);
  private readonly store = inject(PlaylistStore);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locale = inject(LOCALE_ID);

  readonly playlist = signal<PlaylistDetail | null>(null);
  readonly items = signal<PlaylistItem[]>([]);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  readonly editing = signal(false);
  readonly editTitle = signal('');
  readonly editDescription = signal('');
  readonly saving = signal(false);

  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);

  /** The score whose removal waits for a confirmation */
  readonly confirmingRemove = signal<PlaylistItem | null>(null);

  /** Announced to screen readers after a move */
  readonly announcement = signal('');

  readonly titleOf = playlistTitle;
  readonly scorePath = scorePath;

  private slug = '';
  private orderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.flushOrder());
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.slug = params.get('slug') ?? '';
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.playlistSlugGet(this.slug).subscribe({
      next: playlist => this.show(playlist),
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        if (error.status === 404) {
          this.notFound.set(true);
        } else {
          this.store.saveFailed();
        }
      },
    });
  }

  private show(playlist: PlaylistDetail): void {
    this.playlist.set(playlist);
    this.items.set(playlist.items);
    this.loading.set(false);
    this.notFound.set(false);
  }

  meta(): { created: string; updated: string } {
    const p = this.playlist();
    return { created: shortDate(p?.createdAt, this.locale), updated: relativeTime(p?.lastModified, this.locale) };
  }

  // --- edit ----------------------------------------------------------------------------------------------------

  startEdit(): void {
    const p = this.playlist();
    if (!p) {
      return;
    }
    this.editTitle.set(playlistTitle(p));
    this.editDescription.set(p.description ?? '');
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    const title = this.editTitle().trim();
    if (!title || this.saving()) {
      return;
    }
    this.saving.set(true);
    // An empty description removes it
    this.api.accountPlaylistSlugPatch(this.slug, { title, description: this.editDescription().trim() }).subscribe({
      next: summary => {
        this.saving.set(false);
        this.editing.set(false);
        this.playlist.update(p => p && { ...p, title: summary.title, description: summary.description, lastModified: summary.lastModified });
      },
      error: () => {
        this.saving.set(false);
        this.store.saveFailed();
      },
    });
  }

  // --- delete --------------------------------------------------------------------------------------------------

  askDelete(): void {
    this.confirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  confirmDelete(): void {
    const p = this.playlist();
    if (!p || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.accountPlaylistSlugDelete(this.slug).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmingDelete.set(false);
        this.toast.show($localize`:@@playlist.toast.deleted:Deleted "${playlistTitle(p)}:title:"`);
        this.router.navigate(['/account/playlists']);
      },
      error: () => {
        this.deleting.set(false);
        this.store.saveFailed();
      },
    });
  }

  // --- reorder -------------------------------------------------------------------------------------------------

  drop(event: CdkDragDrop<PlaylistItem[]>): void {
    this.move(event.previousIndex, event.currentIndex);
  }

  move(from: number, to: number): void {
    const list = [...this.items()];
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
      return;
    }
    moveItemInArray(list, from, to);
    this.items.set(list.map((item, i) => ({ ...item, position: i })));
    const title = list[to].score.title ?? '';
    this.announcement.set($localize`:@@playlist.moved:${title}:title: moved to position ${to + 1}:position: of ${list.length}:count:`);
    this.scheduleOrderSave();
  }

  /** Alt+↑ / Alt+↓ on a focused row moves it. */
  onRowKeydown(event: KeyboardEvent, index: number): void {
    if (!event.altKey) {
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.move(index, index - 1);
      this.focusRow(index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.move(index, index + 1);
      this.focusRow(index + 1);
    }
  }

  private focusRow(index: number): void {
    setTimeout(() => (document.querySelectorAll<HTMLElement>('[data-row]')[index])?.focus());
  }

  private scheduleOrderSave(): void {
    if (this.orderTimer) {
      clearTimeout(this.orderTimer);
    }
    this.orderTimer = setTimeout(() => this.flushOrder(), ORDER_SAVE_DELAY_MS);
  }

  /** Sends a pending reorder now. */
  flushOrder(): void {
    if (!this.orderTimer) {
      return;
    }
    clearTimeout(this.orderTimer);
    this.orderTimer = null;
    this.saveOrder(this.items().map(i => i.score.id!));
  }

  private saveOrder(scoreIds: string[]): void {
    this.api.accountPlaylistItemsOrderPut(this.slug, { scoreIds }).subscribe({
      next: playlist => this.playlist.update(p => p && { ...p, lastModified: playlist.lastModified }),
      error: (error: HttpErrorResponse) => {
        if (error.status === 409) {
          this.toast.show($localize`:@@playlist.toast.reloaded:This playlist changed elsewhere, reloaded`);
        } else {
          this.store.saveFailed();
        }
        this.load();
      },
    });
  }

  // --- remove --------------------------------------------------------------------------------------------------

  askRemove(item: PlaylistItem): void {
    this.confirmingRemove.set(item);
  }

  cancelRemove(): void {
    this.confirmingRemove.set(null);
  }

  confirmRemove(): void {
    const item = this.confirmingRemove();
    this.confirmingRemove.set(null);
    if (item) {
      this.remove(item);
    }
  }

  /** Removes the score at once; Undo puts it back where it was. */
  private remove(item: PlaylistItem): void {
    const scoreId = item.score.id;
    if (!scoreId) {
      return;
    }
    this.flushOrder();
    const index = this.items().findIndex(i => i.score.id === scoreId);
    this.items.update(list => list.filter(i => i.score.id !== scoreId).map((it, i) => ({ ...it, position: i })));
    this.playlist.update(p => p && { ...p, itemCount: p.itemCount - 1 });
    this.store.removeFrom(this.slug, scoreId).subscribe({
      next: () => this.toast.show($localize`:@@playlist.toast.removedFrom:Removed from "${playlistTitle(this.playlist() ?? {})}:title:"`, {
        action: { label: $localize`:@@playlist.toast.undo:Undo`, run: () => this.undoRemove(item, index) },
      }),
      error: () => {
        this.store.saveFailed();
        this.load();
      },
    });
  }

  /**
   * Adding always appends: re-add the score, then move it back to its old place if that was not the end.
   */
  private undoRemove(item: PlaylistItem, index: number): void {
    const scoreId = item.score.id!;
    this.store.addTo(this.slug, scoreId).subscribe({
      next: () => {
        const list = [...this.items()];
        const at = Math.min(index, list.length);
        list.splice(at, 0, item);
        this.items.set(list.map((it, i) => ({ ...it, position: i })));
        this.playlist.update(p => p && { ...p, itemCount: p.itemCount + 1 });
        if (at < list.length - 1) {
          this.saveOrder(list.map(i => i.score.id!));
        }
      },
      error: () => {
        this.store.saveFailed();
        this.load();
      },
    });
  }
}
