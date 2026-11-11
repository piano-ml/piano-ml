import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ScoreApiInfo } from '../../../core/api';
import { ScoreTableComponent, type ScoreTableColumn } from './score-table.component';

const SCORE = {
  id: 's1', title: 'Gymnopédie No. 1', author: 'Erik Satie', genre: 'classical', grade: 3, duration: 185,
  tracks_count: 2, version: 2, uploaded_at: '2026-11-10T12:00:00Z',
} as ScoreApiInfo;

/** The shared score list (library, My Scores): columns, formatting, row clicks, actions, empty and loading states. */
describe('ScoreTableComponent', () => {
  let fixture: ComponentFixture<ScoreTableComponent>;
  let component: ScoreTableComponent;
  let el: HTMLElement;

  function render(inputs: Partial<Record<'scores' | 'loading' | 'columns' | 'actions' | 'emptyMessage' | 'loadingMessage' | 'showRowClick', unknown>> = {}) {
    fixture = TestBed.createComponent(ScoreTableComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.componentRef.setInput('scores', [SCORE]);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }
  const headers = () => [...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
  const cells = (row = 0) => [...el.querySelectorAll('tbody tr')[row].querySelectorAll('td')].map((td) => td.textContent?.trim());

  describe('default columns', () => {
    it('shows title, author, genre, difficulty, duration and tracks', () => {
      render();
      expect(headers()).toEqual(['Title', 'Author', 'Genre', 'Difficulty', 'Duration', 'Tracks']);
      expect(cells()).toEqual(['Gymnopédie No. 1', 'Erik Satie', 'classical', '3', '3:05', '2']);
    });

    it('shows N/A for missing genre, duration and tracks', () => {
      render({ scores: [{ id: 's2', title: 'Untitled' } as ScoreApiInfo] });
      expect(cells()).toEqual(['Untitled', '', 'N/A', '', 'N/A', 'N/A']);
    });

    it('formats the hidden version and upload columns too', () => {
      render();
      const byKey = (key: string) => component.defaultColumns.find((c) => c.key === key)!;
      expect(component.getCellValue(SCORE, byKey('version'))).toBe('v2');
      expect(component.getCellValue({} as ScoreApiInfo, byKey('version'))).toBe('v1');
      expect(component.getCellValue(SCORE, byKey('uploaded_at'))).toBe(new Date(SCORE.uploaded_at!).toLocaleDateString());
      expect(component.getCellValue({} as ScoreApiInfo, byKey('uploaded_at'))).toBe('N/A');
    });
  });

  describe('custom columns', () => {
    it('reads nested values and applies alignment and narrow layout', () => {
      const columns: ScoreTableColumn[] = [
        { key: 'meta.key', label: 'Key', visible: true, align: 'right' },
        { key: 'title', label: 'Title', visible: true, align: 'center' },
        { key: 'id', label: '', visible: true, narrow: true },
        { key: 'author', label: 'Hidden', visible: false },
      ];
      render({ scores: [{ ...SCORE, meta: { key: 'C major' } } as ScoreApiInfo], columns });
      expect(headers()).toEqual(['Key', 'Title', '']);
      expect(cells()).toEqual(['C major', 'Gymnopédie No. 1', 's1']);
      const tds = el.querySelectorAll('tbody td');
      expect(tds[0].className).toContain('text-right');
      expect(tds[1].className).toContain('text-center');
      expect(tds[2].className).toContain('px-2');
    });

    it('renders an icon with its label instead of text', () => {
      const columns: ScoreTableColumn[] = [
        { key: 'id', label: 'Lock', visible: true, icon: () => ({ name: 'bootstrapLockFill', label: 'Copyrighted', tone: 'caution' }) },
        { key: 'title', label: 'Title', visible: true, icon: () => null },
      ];
      render({ columns });
      const badge = el.querySelector('.cell-icon') as HTMLElement;
      expect(badge.dataset['icon']).toBe('bootstrapLockFill');
      expect(badge.title).toBe('Copyrighted');
      expect(cells()[1]).toBe('Gymnopédie No. 1'); // null icon: falls back to the text
    });
  });

  describe('rows and actions', () => {
    it('emits a click on a row, asking for a new tab with ctrl or cmd', () => {
      render();
      const clicks: unknown[] = [];
      component.scoreClick.subscribe((e) => clicks.push(e));
      const row = el.querySelector('tbody tr') as HTMLElement;
      row.click();
      row.dispatchEvent(new MouseEvent('click', { metaKey: true, bubbles: true }));
      expect(clicks).toEqual([{ score: SCORE, openInNewTab: false }, { score: SCORE, openInNewTab: true }]);
      expect(row.classList).toContain('cursor-pointer');
    });

    it('ignores row clicks when disabled', () => {
      render({ showRowClick: false });
      const clicks: unknown[] = [];
      component.scoreClick.subscribe((e) => clicks.push(e));
      (el.querySelector('tbody tr') as HTMLElement).click();
      expect(clicks).toEqual([]);
    });

    it('runs an action without also clicking the row', () => {
      const callback = vi.fn();
      render({ actions: [{ label: 'Delete', icon: '🗑', class: 'btn-danger', callback }, { label: 'Edit', callback: vi.fn() }] });
      const clicks: unknown[] = [];
      component.scoreClick.subscribe((e) => clicks.push(e));
      expect(headers().at(-1)).toBe('Actions');
      const [del, edit] = [...el.querySelectorAll('tbody button')] as HTMLButtonElement[];
      expect([del.textContent?.trim(), del.className, edit.textContent?.trim(), edit.className]).toEqual(['🗑', 'btn-danger', 'Edit', 'btn-small']);
      del.click();
      expect(callback).toHaveBeenCalledWith(SCORE);
      expect(clicks).toEqual([]);
    });
  });

  describe('states', () => {
    it('shows the loading message instead of the table', () => {
      render({ loading: true, loadingMessage: 'Loading scores…' });
      expect(el.querySelector('table')).toBeNull();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Loading scores…');
    });

    it('shows the empty message when there is no score', () => {
      render({ scores: [], emptyMessage: 'Nothing here yet' });
      expect(el.querySelector('table')).toBeNull();
      expect(el.textContent).toContain('Nothing here yet');
    });
  });

  it('formats durations as m:ss, N/A when unknown', () => {
    render();
    expect([component.formatDuration(5), component.formatDuration(600), component.formatDuration(null), component.formatDuration(0)])
      .toEqual(['0:05', '10:00', 'N/A', 'N/A']);
  });
});
