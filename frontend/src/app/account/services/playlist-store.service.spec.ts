import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PlaylistService } from '../../core/api';
import { ToastService } from '../../shared/services/toast.service';
import { AuthService } from './auth.service';
import { FAVORITES_SLUG, PENDING_FAVORITE_KEY, PlaylistStore, playlistTitle } from './playlist-store.service';

describe('PlaylistStore', () => {
  let loggedIn: BehaviorSubject<boolean>;
  let api: Record<'accountFavoriteIdsGet' | 'accountPlaylistItemsPost' | 'accountPlaylistItemDelete' | 'accountPlaylistPost', ReturnType<typeof vi.fn>>;
  let toast: ToastService;

  function create(platform = 'browser', ids: string[] = ['a']) {
    loggedIn = new BehaviorSubject<boolean>(true);
    api = {
      accountFavoriteIdsGet: vi.fn(() => of(ids)),
      accountPlaylistItemsPost: vi.fn(() => of({ position: 0 })),
      accountPlaylistItemDelete: vi.fn(() => of(null)),
      accountPlaylistPost: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: PlaylistService, useValue: api },
        { provide: AuthService, useValue: { isLoggedIn: loggedIn.asObservable() } },
      ],
    });
    toast = TestBed.inject(ToastService);
    return TestBed.inject(PlaylistStore);
  }

  afterEach(() => sessionStorage.clear());

  it('loads the favorite ids at login and clears them at logout', () => {
    const store = create();
    expect(store.isFavorite('a')).toBe(true);
    loggedIn.next(false);
    expect(store.isFavorite('a')).toBe(false);
    expect(store.favoriteIds().size).toBe(0);
  });

  it('makes no call on the server', () => {
    const store = create('server');
    expect(api.accountFavoriteIdsGet).not.toHaveBeenCalled();
    expect(store.isFavorite('a')).toBe(false);
  });

  it('fills the heart at once and keeps it when the call succeeds', () => {
    const store = create();
    const reply = new Subject<unknown>();
    api.accountPlaylistItemsPost.mockReturnValue(reply);
    store.toggleFavorite({ id: 'b', title: 'Prelude' });
    expect(store.isFavorite('b')).toBe(true);
    expect(api.accountPlaylistItemsPost).toHaveBeenCalledWith(FAVORITES_SLUG, { scoreId: 'b' });
    reply.next({ position: 1 });
    expect(store.isFavorite('b')).toBe(true);
    expect(toast.current()?.message).toBe('Added to Favorites');
  });

  it('rolls the heart back and says so when the call fails', () => {
    const store = create();
    api.accountPlaylistItemsPost.mockReturnValue(throwError(() => new Error('down')));
    store.toggleFavorite({ id: 'b' });
    expect(store.isFavorite('b')).toBe(false);
    expect(toast.current()?.tone).toBe('error');

    api.accountPlaylistItemDelete.mockReturnValue(throwError(() => new Error('down')));
    store.toggleFavorite({ id: 'a' });
    expect(store.isFavorite('a')).toBe(true);
  });

  it('offers Undo after removing a favorite', () => {
    const store = create();
    store.toggleFavorite({ id: 'a' });
    expect(store.isFavorite('a')).toBe(false);
    expect(toast.current()?.action?.label).toBe('Undo');
    toast.runAction();
    expect(store.isFavorite('a')).toBe(true);
    expect(api.accountPlaylistItemsPost).toHaveBeenCalledWith(FAVORITES_SLUG, { scoreId: 'a' });
  });

  it('logged out, remembers the favorite, goes to login, and applies it after login', () => {
    const store = create();
    loggedIn.next(false);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    store.toggleFavorite({ id: 'c' });
    expect(api.accountPlaylistItemsPost).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_FAVORITE_KEY)).toBe('c');
    expect(navigate).toHaveBeenCalledWith(['/account/login'], expect.anything());

    loggedIn.next(true);
    expect(api.accountPlaylistItemsPost).toHaveBeenCalledWith(FAVORITES_SLUG, { scoreId: 'c' });
    expect(store.isFavorite('c')).toBe(true);
    expect(sessionStorage.getItem(PENDING_FAVORITE_KEY)).toBeNull();
  });

  it('keeps the hearts in step with additions to and removals from Favorites through the menu', () => {
    const store = create();
    store.addTo(FAVORITES_SLUG, 'd').subscribe();
    expect(store.isFavorite('d')).toBe(true);
    store.addTo('recital', 'e').subscribe();
    expect(store.isFavorite('e')).toBe(false);
    store.removeFrom(FAVORITES_SLUG, 'd').subscribe();
    expect(store.isFavorite('d')).toBe(false);
  });

  it('shows the Favorites title in the page language until renamed', () => {
    expect(playlistTitle({ isDefault: true, title: 'Favorites' })).toBe('Favorites');
    expect(playlistTitle({ isDefault: true, title: 'Coups de cœur' })).toBe('Coups de cœur');
    expect(playlistTitle({ isDefault: false, title: 'Recital' })).toBe('Recital');
  });
});
