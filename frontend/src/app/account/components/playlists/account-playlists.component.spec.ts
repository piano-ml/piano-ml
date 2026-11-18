import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlaylistPage, PlaylistService, PlaylistSummary } from '../../../core/api';
import { PlaylistStore } from '../../services/playlist-store.service';
import { AccountPlaylistsComponent, PLAYLIST_PAGE_SIZE } from './account-playlists.component';

function summary(slug: string, isDefault = false): PlaylistSummary {
  return {
    id: slug, slug, title: isDefault ? 'Favorites' : slug, isDefault, owner: { name: 'me' }, itemCount: 2,
    createdAt: '2026-11-01T10:00:00Z', lastModified: '2026-11-15T10:00:00Z', coverImages: ['https://img/1.png'],
  };
}

describe('AccountPlaylistsComponent', () => {
  let fixture: ComponentFixture<AccountPlaylistsComponent>;
  let api: { accountPlaylistsGet: ReturnType<typeof vi.fn> };

  function create(...pages: PlaylistPage[]) {
    api = { accountPlaylistsGet: vi.fn() };
    pages.forEach(page => api.accountPlaylistsGet.mockReturnValueOnce(of(page)));
    TestBed.configureTestingModule({
      imports: [AccountPlaylistsComponent],
      providers: [provideRouter([]), { provide: PlaylistService, useValue: api }, { provide: PlaylistStore, useValue: {} }],
    });
    fixture = TestBed.createComponent(AccountPlaylistsComponent);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const q = (testId: string) => el().querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  it('shows a card per playlist and loads the next page on demand', () => {
    create(
      { items: [summary('favorites', true), summary('recital')], total: 3, offset: 0, limit: PLAYLIST_PAGE_SIZE },
      { items: [summary('scales')], total: 3, offset: 2, limit: PLAYLIST_PAGE_SIZE },
    );
    expect(api.accountPlaylistsGet).toHaveBeenCalledWith(0, PLAYLIST_PAGE_SIZE, 'lastModified_desc');
    expect(q('playlist-favorites')!.getAttribute('href')).toBe('/account/playlists/favorites');
    expect(q('playlist-favorites')!.textContent).toContain('2 scores');
    expect(el().textContent).toContain('2 of 3');

    q('load-more')!.click();
    fixture.detectChanges();
    expect(api.accountPlaylistsGet).toHaveBeenLastCalledWith(2, PLAYLIST_PAGE_SIZE, 'lastModified_desc');
    expect(q('playlist-scales')).not.toBeNull();
    expect(q('load-more')).toBeNull();
  });

  it('restarts from the first page when the order changes', () => {
    create(
      { items: [summary('a')], total: 1, offset: 0, limit: PLAYLIST_PAGE_SIZE },
      { items: [summary('a')], total: 1, offset: 0, limit: PLAYLIST_PAGE_SIZE },
    );
    fixture.componentInstance.sortBy('title_asc');
    expect(api.accountPlaylistsGet).toHaveBeenLastCalledWith(0, PLAYLIST_PAGE_SIZE, 'title_asc');
  });

  it('shows the empty state without any playlist', () => {
    create({ items: [], total: 0, offset: 0, limit: PLAYLIST_PAGE_SIZE });
    expect(q('playlists-empty')!.textContent).toContain('Tap ♡ on any score');
  });
});
