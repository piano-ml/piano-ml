import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Midi } from '@tonejs/midi';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';
import { ScoreApiInfo, ScoreService } from '../../../core/api';
import { provideTesting } from '../../../testing/test-providers';
import { ScoreReimportComponent } from './score-reimport.component';

/**
 * The original upload of a MIDI score: an empty track, a bass, the piano's left hand (track 2), its right hand
 * (track 3) and drums (track 4), as indexes in the file.
 */
function originalMidi(): Blob {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.addTrack(); // 0: empty
  const specs: [number, number, number][] = [[35, 28, 20], [0, 40, 30], [0, 64, 50], [-1, 36, 10]];
  specs.forEach(([program, low, count], i) => {
    const track = midi.addTrack();
    track.channel = i;
    if (program < 0) track.channel = 9;
    else track.instrument.number = program;
    track.name = ['Bass', 'Piano LH', 'Piano RH', 'Drums'][i];
    for (let n = 0; n < count; n++) track.addNote({ midi: low + (n % 12), ticks: n * 240, durationTicks: 240 });
  });
  return new Blob([new Uint8Array(midi.toArray())], { type: 'audio/midi' });
}

const SCORE: ScoreApiInfo = {
  id: 'sc1', title: 'My Castle Town', author: 'Toby Fox', owner_id: 'owner-1', version: 1, has_files: true,
  immutableSlug: 'fox-toby-my-castle-town', study_tracks: [1],
} as ScoreApiInfo;

/** /score/:slug/reimport: owners and admins choose the study tracks again from the original MIDI file. */
describe('ScoreReimportComponent', () => {
  let fixture: ComponentFixture<ScoreReimportComponent>;
  let component: ScoreReimportComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;
  let user: { id: string | null; admin: boolean };
  let scores: {
    scoreGetBySlug: ReturnType<typeof vi.fn>;
    scoreOwnerIdTypeVersionRevisionGet: ReturnType<typeof vi.fn>;
    scoreIdReimportPost: ReturnType<typeof vi.fn>;
  };

  // Reading the MIDI blob takes an unknown number of ticks (longer under load): wait for the load to end.
  const settle = async () => {
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    fixture.detectChanges();
  };
  async function render() {
    fixture = TestBed.createComponent(ScoreReimportComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  }
  const checkbox = (track: number) => el.querySelector(`tr[data-track="${track}"] input[type=checkbox]`) as HTMLInputElement;
  const listed = () => [...el.querySelectorAll('tr[data-track]')].map((row) => Number(row.getAttribute('data-track')));
  const reimportButton = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Re-import') as HTMLButtonElement;

  beforeEach(() => {
    user = { id: 'owner-1', admin: false };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    scores = {
      scoreGetBySlug: vi.fn((): Observable<ScoreApiInfo> => of(SCORE)),
      scoreOwnerIdTypeVersionRevisionGet: vi.fn((): Observable<HttpResponse<Blob>> => of(new HttpResponse({ body: originalMidi() }))),
      scoreIdReimportPost: vi.fn((): Observable<ScoreApiInfo> => of(SCORE)),
    };
    TestBed.configureTestingModule({
      imports: [ScoreReimportComponent],
      providers: [
        ...provideTesting(),
        { provide: ScoreService, useValue: scores },
        { provide: AuthService, useValue: { getUserId: () => user.id, isAdmin: () => user.admin } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'fox-toby-my-castle-town' }) } } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => fixture?.destroy());

  it('reads the original upload and lists its tracks with notes, the current study tracks checked', async () => {
    await render();
    expect(scores.scoreGetBySlug).toHaveBeenCalledWith('fox-toby-my-castle-town');
    expect(scores.scoreOwnerIdTypeVersionRevisionGet).toHaveBeenCalledWith('owner-1', 'sc1', 'original', 1, 1, 'response');
    expect(listed()).toEqual([1, 2, 3, 4]); // the empty track 0 is not listed, indexes stay those of the file
    expect(checkbox(1).checked).toBe(true);
    expect(checkbox(4).disabled).toBe(true); // drums
    expect(el.textContent).toContain('Both hands');
  });

  it('re-imports with the chosen tracks, right hand first, then opens the score page', async () => {
    await render();
    checkbox(1).click(); // drop the bass
    checkbox(2).click(); // piano left hand
    checkbox(3).click(); // piano right hand
    fixture.detectChanges();
    expect(checkbox(1).disabled).toBe(true); // two tracks chosen: the others are locked
    el.querySelector<HTMLInputElement>('#reimport-fingering')!.click();
    reimportButton().click();
    expect(scores.scoreIdReimportPost).toHaveBeenCalledWith('sc1', { study_tracks: [3, 2], make_fingering: false });
    expect(navigate).toHaveBeenCalledWith(['/score', 'fox-toby-my-castle-town']);
  });

  it('keeps a progress message while the server converts the score', async () => {
    scores.scoreIdReimportPost.mockReturnValue(NEVER);
    await render();
    reimportButton().click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="reimport-progress"]')).toBeTruthy();
  });

  it('falls back to the default tracks (the piano) when the current ones no longer fit the file', async () => {
    scores.scoreGetBySlug.mockReturnValue(of({ ...SCORE, study_tracks: [7] }));
    await render();
    expect(component.studies()).toEqual([3, 2]);
  });

  it('cannot re-import without a study track', async () => {
    await render();
    checkbox(1).click();
    fixture.detectChanges();
    expect(reimportButton().disabled).toBe(true);
  });

  it('explains a failed re-import and lets the user try again', async () => {
    scores.scoreIdReimportPost.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await render();
    reimportButton().click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="reimport-failed"]')?.textContent).toContain('failed');
    expect(reimportButton()).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets admins re-import scores of other users', async () => {
    user = { id: 'admin-1', admin: true };
    await render();
    expect(listed()).toHaveLength(4);
  });

  it('refuses anyone but the owner and admins, without downloading the original', async () => {
    user = { id: 'someone-else', admin: false };
    await render();
    expect(el.querySelector('[data-testid="reimport-error"]')?.textContent).toContain('Only the owner');
    expect(scores.scoreOwnerIdTypeVersionRevisionGet).not.toHaveBeenCalled();
  });

  it('refuses scores whose original upload is not a MIDI file', async () => {
    scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(of(new HttpResponse({
      body: new Blob(['%PDF'], { type: '' }), headers: new HttpHeaders({ 'Content-Type': 'application/pdf' }),
    })));
    await render();
    expect(el.querySelector('[data-testid="reimport-error"]')?.textContent).toContain('Only scores imported from a MIDI file');
    expect(reimportButton()).toBeUndefined();
  });

  it('explains when the original upload is missing', async () => {
    scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    await render();
    expect(el.querySelector('[data-testid="reimport-error"]')?.textContent).toContain('not available');
  });
});
