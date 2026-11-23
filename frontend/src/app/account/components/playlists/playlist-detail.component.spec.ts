import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PlaylistDetail, PlaylistService } from '../../../core/api';
import { PlaylistStore } from '../../services/playlist-store.service';
import { ToastService } from '../../../shared/services/toast.service';
import { ORDER_SAVE_DELAY_MS, PlaylistDetailComponent } from './playlist-detail.component';

function detail(ids: string[], isDefault = false): PlaylistDetail {
  return {
    id: 'p1', slug: isDefault ? 'favorites' : 'recital', title: isDefault ? 'Favorites' : 'Recital', isDefault,
    owner: { name: 'me' }, itemCount: ids.length, createdAt: '2026-03-03T10:00:00Z', lastModified: '2026-11-15T10:00:00Z',
    coverImages: [],
    items: ids.map((id, i) => ({ position: i, addedAt: '2026-11-01T10:00:00Z', score: { id, title: id.toUpperCase() } })),
  };
}

describe('PlaylistDetailComponent', () => {
  let fixture: ComponentFixture<PlaylistDetailComponent>;
  let api: Record<'playlistSlugGet' | 'accountPlaylistItemsOrderPut' | 'accountPlaylistSlugPatch' | 'accountPlaylistSlugDelete', ReturnType<typeof vi.fn>>;
  let store: { addTo: ReturnType<typeof vi.fn>; removeFrom: ReturnType<typeof vi.fn>; saveFailed: ReturnType<typeof vi.fn> };

  function create(playlist = detail(['a', 'b', 'c'])) {
    api = {
      playlistSlugGet: vi.fn(() => of(playlist)),
      accountPlaylistItemsOrderPut: vi.fn(() => of(playlist)),
      accountPlaylistSlugPatch: vi.fn(),
      accountPlaylistSlugDelete: vi.fn(() => of(null)),
    };
    store = {
      addTo: vi.fn(() => of({ position: 2 })),
      removeFrom: vi.fn(() => of(undefined)),
      saveFailed: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [PlaylistDetailComponent],
      providers: [
        provideRouter([]),
        { provide: PlaylistService, useValue: api },
        { provide: PlaylistStore, useValue: store },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug: playlist.slug })) } },
      ],
    });
    fixture = TestBed.createComponent(PlaylistDetailComponent);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const q = (testId: string) => el().querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const order = () => fixture.componentInstance.items().map(i => i.score.id);

  afterEach(() => vi.useRealTimers());

  it('sends several moves as one debounced reorder', () => {
    vi.useFakeTimers();
    create();
    q('down-a')!.click();
    fixture.detectChanges();
    q('down-a')!.click();
    fixture.detectChanges();
    expect(order()).toEqual(['b', 'c', 'a']);
    expect(api.accountPlaylistItemsOrderPut).not.toHaveBeenCalled();

    vi.advanceTimersByTime(ORDER_SAVE_DELAY_MS);
    expect(api.accountPlaylistItemsOrderPut).toHaveBeenCalledTimes(1);
    expect(api.accountPlaylistItemsOrderPut).toHaveBeenCalledWith('recital', { scoreIds: ['b', 'c', 'a'] });
  });

  it('moves a focused row with Alt+arrows and announces it', () => {
    create();
    fixture.componentInstance.onRowKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true }), 2);
    expect(order()).toEqual(['a', 'c', 'b']);
    expect(fixture.componentInstance.announcement()).toBe('C moved to position 2 of 3');
    fixture.componentInstance.onRowKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }), 1);
    expect(order()).toEqual(['a', 'c', 'b']);
  });

  it('reloads when the playlist changed elsewhere (409)', () => {
    vi.useFakeTimers();
    create();
    api.accountPlaylistItemsOrderPut.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    q('up-b')!.click();
    vi.advanceTimersByTime(ORDER_SAVE_DELAY_MS);
    expect(api.playlistSlugGet).toHaveBeenCalledTimes(2);
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(TestBed.inject(ToastService).current()?.message).toContain('changed elsewhere');
  });

  it('removes a score with Undo, which puts it back at its old position', () => {
    create();
    q('remove-a')!.click();
    fixture.detectChanges();
    expect(store.removeFrom).toHaveBeenCalledWith('recital', 'a');
    expect(order()).toEqual(['b', 'c']);

    TestBed.inject(ToastService).runAction();
    expect(store.addTo).toHaveBeenCalledWith('recital', 'a');
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(api.accountPlaylistItemsOrderPut).toHaveBeenCalledWith('recital', { scoreIds: ['a', 'b', 'c'] });
  });

  it('Undo of the last score needs no reorder: adding appends', () => {
    create();
    q('remove-c')!.click();
    TestBed.inject(ToastService).runAction();
    expect(order()).toEqual(['a', 'b', 'c']);
    expect(api.accountPlaylistItemsOrderPut).not.toHaveBeenCalled();
  });

  it('cannot delete Favorites', () => {
    create(detail(['a'], true));
    expect(q('playlist-title')!.textContent).toContain('Favorites');
    expect(q('edit-playlist')).not.toBeNull();
    expect(q('delete-playlist')).toBeNull();
  });

  it('deletes another playlist after confirmation', () => {
    create();
    q('delete-playlist')!.click();
    fixture.detectChanges();
    expect(api.accountPlaylistSlugDelete).not.toHaveBeenCalled();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    q('delete-confirm')!.click();
    expect(api.accountPlaylistSlugDelete).toHaveBeenCalledWith('recital');
    expect(navigate).toHaveBeenCalledWith(['/account/home/playlists']);
  });

  it('says so for an unknown playlist', () => {
    create();
    api.playlistSlugGet.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(q('playlist-not-found')).not.toBeNull();
  });
});
