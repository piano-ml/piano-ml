import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { MusicbrainzService } from '../../../core/api/api/musicbrainz.service';
import { provideTesting } from '../../../testing/test-providers';
import { AuthorSearchModalComponent } from './author-search-modal.component';

describe('AuthorSearchModalComponent', () => {
  let component: AuthorSearchModalComponent;
  let fixture: ComponentFixture<AuthorSearchModalComponent>;
  let el: HTMLElement;
  let search: ReturnType<typeof vi.spyOn>;
  let selected: { author: string | null; author_id: string | null }[];
  let closed: number;

  const SATIE = { id: 'mb-satie', name: 'Erik Satie', disambiguation: 'French composer' };
  const SATIE_2 = { id: 'mb-satie-2', name: 'Erik Satie Tribute Band' };

  function open(inputs: { currentAuthor?: string } = {}) {
    fixture = TestBed.createComponent(AuthorSearchModalComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.componentRef.setInput('isOpen', true);
    if (inputs.currentAuthor) fixture.componentRef.setInput('currentAuthor', inputs.currentAuthor);
    selected = [];
    closed = 0;
    component.authorSelected.subscribe((a) => selected.push(a));
    component.closeModal.subscribe(() => closed++);
    fixture.detectChanges();
  }

  /** Types a query and presses Enter, like a user. */
  async function searchFor(query: string) {
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    fixture.detectChanges();
  }

  const buttons = () => [...el.querySelectorAll('button')] as HTMLButtonElement[];
  const button = (text: string) => buttons().find((b) => b.textContent?.includes(text));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthorSearchModalComponent],
      providers: provideTesting(),
    }).compileComponents();
    search = vi.spyOn(TestBed.inject(MusicbrainzService), 'artistSearchQueryGet');
  });

  it('renders nothing while closed', () => {
    fixture = TestBed.createComponent(AuthorSearchModalComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('invites to search when opened without an author', () => {
    open();
    expect(el.textContent).toContain('Type a name and press ↵ to search MusicBrainz');
    expect(button('as author')).toBeUndefined();
  });

  it('pre-fills the search with the current author', async () => {
    open({ currentAuthor: 'Satie' });
    await fixture.whenStable();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('Satie');
    expect(button('Use')?.textContent).toContain('"Satie"');
  });

  describe('searching MusicBrainz', () => {
    it('lists the matching artists with their disambiguation', async () => {
      search.mockReturnValue(of([SATIE, SATIE_2]) as never);
      open();
      await searchFor('  satie  ');
      expect(search).toHaveBeenCalledWith('satie'); // trimmed
      expect(el.textContent).toContain('Erik Satie');
      expect(el.textContent).toContain('French composer');
      expect(buttons().filter((b) => b.textContent?.includes('Select'))).toHaveLength(2);
    });

    it('accepts a single artist object as a one-item list', async () => {
      search.mockReturnValue(of(SATIE) as never);
      open();
      await searchFor('satie');
      expect(buttons().filter((b) => b.textContent?.includes('Select'))).toHaveLength(1);
    });

    it('says when nothing matched', async () => {
      search.mockReturnValue(of([]) as never);
      open();
      await searchFor('zzzz');
      expect(el.textContent).toContain('No results for "zzzz"');
    });

    it('shows a spinner while searching', async () => {
      search.mockReturnValue(NEVER as never);
      open();
      await searchFor('satie');
      expect(el.querySelector('.spinner')).not.toBeNull();
    });

    it('shows the error when the search fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      search.mockReturnValue(throwError(() => new Error('MusicBrainz 503')) as never);
      open();
      await searchFor('satie');
      expect(el.textContent).toContain('MusicBrainz 503');
      expect(el.querySelector('.spinner')).toBeNull();
    });

    it('does not search an empty query', () => {
      open();
      component.searchQuery = '   ';
      component.searchAuthors();
      expect(search).not.toHaveBeenCalled();
    });
  });

  describe('choosing', () => {
    it('emits the selected artist with its MusicBrainz id, then closes', async () => {
      search.mockReturnValue(of([SATIE]) as never);
      open();
      await searchFor('satie');
      button('Select')?.click();
      expect(selected).toEqual([{ author: 'Erik Satie', author_id: 'mb-satie' }]);
      expect(closed).toBe(1);
    });

    it('uses the typed name as author without MusicBrainz link', async () => {
      open();
      await searchFor('  Anonymous  ');
      button('as author')?.click();
      expect(selected).toEqual([{ author: 'Anonymous', author_id: null }]);
      expect(closed).toBe(1);
    });

    it('does not emit an empty manual author', () => {
      open();
      component.manualAuthor = '  ';
      component.selectManualAuthor();
      expect(selected).toEqual([]);
    });
  });

  describe('closing', () => {
    it('closes with Cancel', () => {
      open();
      button('Cancel')?.click();
      expect(closed).toBe(1);
    });

    it('closes with Escape, only while open', () => {
      open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
      fixture.componentRef.setInput('isOpen', false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
    });

    it('closes on a click on the backdrop, not inside the dialog', () => {
      open();
      (el.querySelector('input') as HTMLElement).click();
      expect(closed).toBe(0);
      (el.querySelector('.fixed') as HTMLElement).click();
      expect(closed).toBe(1);
    });
  });
});
