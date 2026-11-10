import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTesting } from '../../../testing/test-providers';
import { of } from 'rxjs';
import { ImportWorkComponent } from './import-work.component';

describe('ImportWorkComponent', () => {
  let component: ImportWorkComponent;
  let fixture: ComponentFixture<ImportWorkComponent>;
  let mockActivatedRoute: any;

  beforeEach(async () => {
    mockActivatedRoute = {
      params: of({ mbid: 'test-mbid-123' })
    };

    await TestBed.configureTestingModule({
      imports: [ImportWorkComponent],
      providers: [
        ...provideTesting(),
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImportWorkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set mbid from route params', () => {
    expect(component.mbid).toBe('test-mbid-123');
  });

  describe('upload loading indicator', () => {
    let http: HttpTestingController;
    const status = () => fixture.nativeElement.querySelector('[role="status"]') as HTMLElement | null;

    /** Picks a MusicXML file in the drop zone, like a user: the upload starts right away. */
    function pickMusicXml() {
      component.work = { mbid: 'w1', title: 'test', artistMbId: 'a1', artistName: 'Artist' } as never;
      const input = fixture.nativeElement.querySelector('#dropzone-file') as HTMLInputElement;
      const files = new DataTransfer();
      files.items.add(new File(['<score-partwise/>'], 'song.musicxml', { type: 'application/xml' }));
      input.files = files.files;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    beforeEach(() => {
      http = TestBed.inject(HttpTestingController);
    });

    it('shows while the score is created and its file uploaded, replacing the drop zone', () => {
      pickMusicXml();
      expect(status()?.textContent).toContain('Importing song.musicxml');
      expect(fixture.nativeElement.querySelector('#dropzone-file')).toBeNull();

      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/score')).flush({ id: 's1', version: 1 });
      fixture.detectChanges();
      expect(status()).not.toBeNull(); // still converting on the server
    });

    it('stays until the new score page opens', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      pickMusicXml();
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/score')).flush({ id: 's1', version: 1, immutableSlug: 'artist-test' });
      http.expectOne((r) => r.method === 'POST' && r.url.includes('/score/s1/musicxml/1/0')).flush({});
      fixture.detectChanges();
      expect(navigate).toHaveBeenCalledWith(['/score', 'artist-test']);
      expect(status()).not.toBeNull();
    });

    it('goes away and shows the error dialog when the upload fails', () => {
      pickMusicXml();
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/score')).flush({ id: 's1', version: 1 });
      http.expectOne((r) => r.method === 'POST' && r.url.includes('/score/s1/musicxml/1/0'))
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(status()).toBeNull();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    });
  });
});
