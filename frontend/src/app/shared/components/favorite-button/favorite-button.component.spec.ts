import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlaylistService, ScoreApiInfo } from '../../../core/api';
import { PlaylistStore } from '../../../account/services/playlist-store.service';
import { FavoriteButtonComponent } from './favorite-button.component';

const SCORE: ScoreApiInfo = { id: 's1', title: 'Prelude' };

describe('FavoriteButtonComponent', () => {
  let fixture: ComponentFixture<FavoriteButtonComponent>;
  let favorites: ReturnType<typeof signal<ReadonlySet<string>>>;
  let store: Record<string, unknown> & { toggleFavorite: ReturnType<typeof vi.fn>; addTo: ReturnType<typeof vi.fn>; removeFrom: ReturnType<typeof vi.fn> };
  let api: { accountPlaylistsContainingGet: ReturnType<typeof vi.fn> };

  function create(withMenu = false, loggedIn = true) {
    favorites = signal<ReadonlySet<string>>(new Set());
    store = {
      loggedIn: signal(loggedIn),
      isFavorite: (id: string) => favorites().has(id),
      toggleFavorite: vi.fn(),
      addTo: vi.fn(() => of({ position: 3 })),
      removeFrom: vi.fn(() => of(undefined)),
      create: vi.fn(),
      saveFailed: vi.fn(),
    };
    api = {
      accountPlaylistsContainingGet: vi.fn(() => of([
        { slug: 'favorites', title: 'Favorites', isDefault: true, itemCount: 2, contains: false },
        { slug: 'recital', title: 'Recital', isDefault: false, itemCount: 3, contains: true },
      ])),
    };
    TestBed.configureTestingModule({
      imports: [FavoriteButtonComponent],
      providers: [{ provide: PlaylistStore, useValue: store }, { provide: PlaylistService, useValue: api }],
    });
    fixture = TestBed.createComponent(FavoriteButtonComponent);
    fixture.componentRef.setInput('score', SCORE);
    fixture.componentRef.setInput('size', 'md');
    fixture.componentRef.setInput('withMenu', withMenu);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const q = (testId: string) => el().querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  it('reflects the favorite state in aria-pressed, label and text', () => {
    create();
    const heart = q('favorite-toggle')!;
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    expect(heart.getAttribute('aria-label')).toBe('Add to favorites');
    expect(heart.textContent).toContain('Favorite');

    favorites.set(new Set(['s1']));
    fixture.detectChanges();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect(heart.getAttribute('aria-label')).toBe('Remove from favorites');
    expect(heart.textContent).toContain('Saved');
  });

  it('toggles the favorite without letting the click reach the row', () => {
    create();
    const rowClick = vi.fn();
    el().addEventListener('click', rowClick);
    q('favorite-toggle')!.click();
    expect(store.toggleFavorite).toHaveBeenCalledWith(SCORE);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('lists the playlists in the menu and adds or removes the score on each checkbox', () => {
    create(true);
    q('favorite-menu-toggle')!.click();
    fixture.detectChanges();
    expect(api.accountPlaylistsContainingGet).toHaveBeenCalledWith('s1');
    expect(q('favorite-menu')).not.toBeNull();

    const favoritesBox = q('membership-favorites') as HTMLInputElement;
    const recitalBox = q('membership-recital') as HTMLInputElement;
    expect(favoritesBox.checked).toBe(false);
    expect(recitalBox.checked).toBe(true);

    favoritesBox.click();
    expect(store.addTo).toHaveBeenCalledWith('favorites', 's1');
    recitalBox.click();
    expect(store.removeFrom).toHaveBeenCalledWith('recital', 's1');
  });

  it('closes the menu on Escape', () => {
    create(true);
    q('favorite-menu-toggle')!.click();
    fixture.detectChanges();
    q('favorite-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(q('favorite-menu')).toBeNull();
  });

  it('logged out, the menu sends to login like the heart', () => {
    create(true, false);
    q('favorite-menu-toggle')!.click();
    fixture.detectChanges();
    expect(q('favorite-menu')).toBeNull();
    expect(store.toggleFavorite).toHaveBeenCalledWith(SCORE);
  });
});
