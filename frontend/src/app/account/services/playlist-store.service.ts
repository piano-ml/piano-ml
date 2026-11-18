import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, distinctUntilChanged, map, tap } from 'rxjs';
import { PlaylistItem, PlaylistService, PlaylistSummary } from '../../core/api';
import { ToastService } from '../../shared/services/toast.service';
import { AuthService } from './auth.service';
import { LOGIN_PATH, loginQueryParams } from './return-url';

/** Slug of every user's Favorites playlist (reserved by the backend). */
export const FAVORITES_SLUG = 'favorites';

/** sessionStorage key of a favorite clicked while logged out, applied after login. */
export const PENDING_FAVORITE_KEY = 'pianoml.pendingFavorite';

const FAVORITES_TITLE = 'Favorites';

/**
 * A playlist's title in the page's language: Favorites is stored in English until its owner renames it.
 */
export function playlistTitle(playlist: { isDefault?: boolean; title?: string }): string {
  if (playlist.isDefault && (!playlist.title || playlist.title === FAVORITES_TITLE)) {
    return $localize`:@@playlist.favorites:Favorites`;
  }
  return playlist.title ?? '';
}

/** The score being saved: what a toast needs to name it. */
export interface FavoriteTarget {
  id?: string;
  title?: string;
}

/**
 * Favorites and playlists state shared by the hearts, the "Save to…" menu and the account pages (issue #278).
 * <p>
 * Favorite ids are loaded once at login and cleared at logout, in the browser only: on the server every heart
 * renders outlined (no hydration mismatch). Hearts update optimistically and roll back when the call fails.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistStore {
  private readonly api = inject(PlaylistService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly ids = signal<ReadonlySet<string>>(new Set());
  /** Ids of the scores in the user's Favorites */
  readonly favoriteIds = this.ids.asReadonly();
  readonly loggedIn = signal(false);

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    this.auth.isLoggedIn.pipe(distinctUntilChanged()).subscribe(loggedIn => {
      this.loggedIn.set(loggedIn);
      if (loggedIn) {
        this.loadFavorites();
      } else {
        this.ids.set(new Set());
      }
    });
  }

  isFavorite(scoreId: string | undefined): boolean {
    return !!scoreId && this.ids().has(scoreId);
  }

  /**
   * Adds the score to Favorites or removes it, at once; the call follows. Logged out, goes to login and
   * favorites the score when the user comes back.
   */
  toggleFavorite(score: FavoriteTarget): void {
    const id = score.id;
    if (!id) {
      return;
    }
    if (!this.loggedIn()) {
      this.goToLogin(id);
      return;
    }
    if (this.isFavorite(id)) {
      this.setFavorite(id, false);
      this.api.accountPlaylistItemDelete(FAVORITES_SLUG, id).subscribe({
        next: () => this.toast.show($localize`:@@playlist.toast.removedFromFavorites:Removed from Favorites`, {
          action: { label: $localize`:@@playlist.toast.undo:Undo`, run: () => this.toggleFavorite(score) },
        }),
        error: () => {
          this.setFavorite(id, true);
          this.saveFailed();
        },
      });
    } else {
      this.setFavorite(id, true);
      this.api.accountPlaylistItemsPost(FAVORITES_SLUG, { scoreId: id }).subscribe({
        next: () => this.favoriteAdded(),
        error: () => {
          this.setFavorite(id, false);
          this.saveFailed();
        },
      });
    }
  }

  /** Appends the score to a playlist (Favorites included) and keeps the hearts in step. */
  addTo(slug: string, scoreId: string): Observable<PlaylistItem> {
    return this.api.accountPlaylistItemsPost(slug, { scoreId }).pipe(
      tap(() => slug === FAVORITES_SLUG && this.setFavorite(scoreId, true)),
    );
  }

  removeFrom(slug: string, scoreId: string): Observable<void> {
    return this.api.accountPlaylistItemDelete(slug, scoreId).pipe(
      tap(() => slug === FAVORITES_SLUG && this.setFavorite(scoreId, false)),
      map(() => undefined),
    );
  }

  create(title: string, description?: string): Observable<PlaylistSummary> {
    return this.api.accountPlaylistPost({ title, description });
  }

  /** Shown when a write failed: the UI has rolled back. */
  saveFailed(): void {
    this.toast.error($localize`:@@playlist.toast.saveFailed:Couldn't save, try again`);
  }

  private favoriteAdded(): void {
    this.toast.show($localize`:@@playlist.toast.addedToFavorites:Added to Favorites`, {
      action: {
        label: $localize`:@@playlist.toast.view:View`,
        run: () => this.router.navigate(['/account/playlists', FAVORITES_SLUG]),
      },
    });
  }

  private setFavorite(scoreId: string, favorite: boolean): void {
    const next = new Set(this.ids());
    if (favorite) {
      next.add(scoreId);
    } else {
      next.delete(scoreId);
    }
    this.ids.set(next);
  }

  private loadFavorites(): void {
    this.api.accountFavoriteIdsGet().subscribe({
      next: ids => {
        this.ids.set(new Set(ids));
        this.applyPendingFavorite();
      },
      // Hearts stay outlined: the rest of the page does not depend on them
      error: () => this.ids.set(new Set()),
    });
  }

  private goToLogin(scoreId: string): void {
    try {
      sessionStorage.setItem(PENDING_FAVORITE_KEY, scoreId);
    } catch {
      // storage unavailable: login still works, the favorite is just not applied afterwards
    }
    this.router.navigate([LOGIN_PATH], { queryParams: loginQueryParams(this.router.url) });
  }

  /** The favorite clicked before logging in. */
  private applyPendingFavorite(): void {
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_FAVORITE_KEY);
      sessionStorage.removeItem(PENDING_FAVORITE_KEY);
    } catch {
      return;
    }
    if (!pending || this.isFavorite(pending)) {
      return;
    }
    const scoreId = pending;
    this.addTo(FAVORITES_SLUG, scoreId).subscribe({
      next: () => this.favoriteAdded(),
      error: () => this.saveFailed(),
    });
  }
}
