import {
  ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapChevronDown, bootstrapHeart, bootstrapHeartFill, bootstrapPlus } from '@ng-icons/bootstrap-icons';
import { PlaylistMembership, PlaylistService, ScoreApiInfo } from '../../../core/api';
import { FAVORITES_SLUG, PlaylistStore, playlistTitle } from '../../../account/services/playlist-store.service';
import { ToastService } from '../../services/toast.service';

/**
 * The heart that adds a score to Favorites in one click (issue #278), with an optional "Save to…" menu for the
 * other playlists. `sm` is icon-only (tables), `md` has a label (score page).
 */
@Component({
  selector: 'app-favorite-button',
  imports: [CdkTrapFocus, NgIcon],
  viewProviders: [provideIcons({ bootstrapChevronDown, bootstrapHeart, bootstrapHeartFill, bootstrapPlus })],
  templateUrl: './favorite-button.component.html',
  styleUrl: './favorite-button.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class FavoriteButtonComponent {
  readonly score = input.required<ScoreApiInfo>();
  readonly size = input<'sm' | 'md'>('sm');
  readonly withMenu = input(false);

  private readonly store = inject(PlaylistStore);
  private readonly api = inject(PlaylistService);
  private readonly toast = inject(ToastService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly chevron = viewChild<ElementRef<HTMLButtonElement>>('chevron');

  readonly favorite = computed(() => this.store.isFavorite(this.score().id));
  readonly label = computed(() => this.favorite()
    ? $localize`:@@favorite.remove:Remove from favorites`
    : $localize`:@@favorite.add:Add to favorites`);
  /** Plays the fill animation once after a click. */
  readonly popping = signal(false);

  readonly menuOpen = signal(false);
  readonly menuLoading = signal(false);
  readonly memberships = signal<PlaylistMembership[]>([]);
  /** Slugs with a write in flight: their checkbox waits. */
  readonly busy = signal<ReadonlySet<string>>(new Set());
  readonly creating = signal(false);
  readonly newTitle = signal('');

  readonly titleOf = playlistTitle;

  toggle(event: Event): void {
    event.stopPropagation();
    if (!this.favorite()) {
      this.popping.set(true);
      setTimeout(() => this.popping.set(false), 320);
    }
    this.store.toggleFavorite(this.score());
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    if (this.menuOpen()) {
      this.closeMenu();
      return;
    }
    if (!this.store.loggedIn()) {
      // Same as the heart: login first, Favorites afterwards
      this.store.toggleFavorite(this.score());
      return;
    }
    this.menuOpen.set(true);
    this.creating.set(false);
    this.newTitle.set('');
    this.loadMemberships();
  }

  closeMenu(returnFocus = false): void {
    this.menuOpen.set(false);
    if (returnFocus) {
      this.chevron()?.nativeElement.focus();
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.closeMenu();
    }
  }

  /** Checking appends the score to the playlist, unchecking removes it; each change applies at once. */
  setMembership(membership: PlaylistMembership, contains: boolean): void {
    const scoreId = this.score().id;
    if (!scoreId || this.busy().has(membership.slug)) {
      return;
    }
    const title = playlistTitle(membership);
    this.markBusy(membership.slug, true);
    this.patchMembership(membership.slug, { contains, itemCount: (membership.itemCount ?? 0) + (contains ? 1 : -1) });
    const done = () => this.markBusy(membership.slug, false);
    const failed = () => {
      done();
      this.patchMembership(membership.slug, { contains: !contains, itemCount: membership.itemCount });
      this.store.saveFailed();
    };
    if (contains) {
      this.store.addTo(membership.slug, scoreId).subscribe({
        next: item => {
          done();
          this.toast.show($localize`:@@playlist.toast.addedTo:Added to "${title}:title:" (#${item.position + 1}:position:)`);
        },
        error: failed,
      });
    } else {
      this.store.removeFrom(membership.slug, scoreId).subscribe({
        next: () => {
          done();
          this.toast.show($localize`:@@playlist.toast.removedFrom:Removed from "${title}:title:"`);
        },
        error: failed,
      });
    }
  }

  startCreate(): void {
    this.creating.set(true);
  }

  /** Creates the playlist and saves the score in it. */
  create(event?: Event): void {
    event?.preventDefault();
    const title = this.newTitle().trim();
    const scoreId = this.score().id;
    if (!title || !scoreId || this.busy().has('')) {
      return;
    }
    this.markBusy('', true);
    this.store.create(title).subscribe({
      next: playlist => {
        this.markBusy('', false);
        const membership: PlaylistMembership = {
          slug: playlist.slug, title: playlist.title, isDefault: false, itemCount: 0, contains: false,
        };
        this.memberships.update(list => [...list, membership]);
        this.creating.set(false);
        this.newTitle.set('');
        this.setMembership(membership, true);
      },
      error: () => {
        this.markBusy('', false);
        this.store.saveFailed();
      },
    });
  }

  isBusy(slug: string): boolean {
    return this.busy().has(slug);
  }

  private loadMemberships(): void {
    const scoreId = this.score().id;
    if (!scoreId) {
      return;
    }
    this.menuLoading.set(true);
    this.api.accountPlaylistsContainingGet(scoreId).subscribe({
      next: list => {
        // The heart may have changed Favorites since: trust the local state for it
        this.memberships.set(list.map(m => m.slug === FAVORITES_SLUG ? { ...m, contains: this.favorite() } : m));
        this.menuLoading.set(false);
      },
      error: () => {
        this.menuLoading.set(false);
        this.closeMenu();
        this.store.saveFailed();
      },
    });
  }

  private patchMembership(slug: string, patch: Partial<PlaylistMembership>): void {
    this.memberships.update(list => list.map(m => m.slug === slug ? { ...m, ...patch } : m));
  }

  private markBusy(slug: string, busy: boolean): void {
    const next = new Set(this.busy());
    if (busy) {
      next.add(slug);
    } else {
      next.delete(slug);
    }
    this.busy.set(next);
  }
}
