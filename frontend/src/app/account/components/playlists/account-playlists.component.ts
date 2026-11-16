import { ChangeDetectionStrategy, Component, LOCALE_ID, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapHeart, bootstrapHeartFill, bootstrapMusicNoteBeamed, bootstrapPlus } from '@ng-icons/bootstrap-icons';
import { PlaylistService, PlaylistSummary } from '../../../core/api';
import { PlaylistStore, playlistTitle } from '../../services/playlist-store.service';
import { relativeTime } from './playlist-format';

export type PlaylistOrderBy = 'lastModified_desc' | 'createdAt_desc' | 'title_asc' | 'itemCount_desc';

export const PLAYLIST_PAGE_SIZE = 24;

/** The user's playlists (issue #278): Favorites first, then a card per playlist, page by page. */
@Component({
  selector: 'app-account-playlists',
  imports: [FormsModule, RouterLink, NgIcon],
  viewProviders: [provideIcons({ bootstrapHeart, bootstrapHeartFill, bootstrapMusicNoteBeamed, bootstrapPlus })],
  templateUrl: './account-playlists.component.html',
  styleUrl: './playlists.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPlaylistsComponent implements OnInit {
  private readonly api = inject(PlaylistService);
  private readonly store = inject(PlaylistStore);
  private readonly router = inject(Router);
  private readonly locale = inject(LOCALE_ID);

  readonly playlists = signal<PlaylistSummary[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal(false);
  readonly orderBy = signal<PlaylistOrderBy>('lastModified_desc');

  readonly creating = signal(false);
  readonly saving = signal(false);
  readonly newTitle = signal('');
  readonly newDescription = signal('');

  readonly orders: { value: PlaylistOrderBy; label: string }[] = [
    { value: 'lastModified_desc', label: $localize`:@@playlist.sort.recent:Recently updated` },
    { value: 'createdAt_desc', label: $localize`:@@playlist.sort.newest:Newest` },
    { value: 'title_asc', label: $localize`:@@playlist.sort.title:A–Z` },
    { value: 'itemCount_desc', label: $localize`:@@playlist.sort.size:Most scores` },
  ];

  readonly titleOf = playlistTitle;
  /** The 4 cells of a cover mosaic */
  readonly cells = [0, 1, 2, 3];

  ngOnInit(): void {
    this.load(true);
  }

  load(reset: boolean): void {
    const offset = reset ? 0 : this.playlists().length;
    this.loading.set(true);
    this.error.set(false);
    this.api.accountPlaylistsGet(offset, PLAYLIST_PAGE_SIZE, this.orderBy()).subscribe({
      next: page => {
        this.playlists.set(reset ? page.items : [...this.playlists(), ...page.items]);
        this.total.set(page.total);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.loaded.set(true);
        this.error.set(true);
      },
    });
  }

  sortBy(order: PlaylistOrderBy): void {
    this.orderBy.set(order);
    this.load(true);
  }

  startCreate(): void {
    this.creating.set(true);
  }

  cancelCreate(): void {
    this.creating.set(false);
    this.newTitle.set('');
    this.newDescription.set('');
  }

  /** Creates the playlist and opens it. */
  create(): void {
    const title = this.newTitle().trim();
    if (!title || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.store.create(title, this.newDescription().trim() || undefined).subscribe({
      next: playlist => {
        this.saving.set(false);
        this.router.navigate(['/account/playlists', playlist.slug]);
      },
      error: () => {
        this.saving.set(false);
        this.store.saveFailed();
      },
    });
  }

  updated(playlist: PlaylistSummary): string {
    return relativeTime(playlist.lastModified, this.locale);
  }

  hasMore(): boolean {
    return this.playlists().length < this.total();
  }
}
