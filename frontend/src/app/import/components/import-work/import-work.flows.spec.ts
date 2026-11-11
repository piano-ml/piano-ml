import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { ScoreService } from '../../../core/api';
import { provideTesting } from '../../../testing/test-providers';
import { SIMPLE_SCORE, scoreMidi } from '../../../testing/score-fixture';
import { ImportWorkComponent } from './import-work.component';

const WORK = { mbid: 'w1', title: 'Happy Birthday', artistMbId: 'a1', artistName: 'Mildred J. Hill' };

/** A MIDI file: the fixture's two piano tracks, plus a drum track and an empty track. */
function midiFile(name = 'song.mid') {
  const midi = scoreMidi(SIMPLE_SCORE);
  midi.tracks[0].name = 'Right';
  midi.tracks[1].name = 'Left';
  const drums = midi.addTrack();
  drums.channel = 9; // percussion
  drums.addNote({ midi: 36, ticks: 0, durationTicks: 480 });
  midi.addTrack(); // no notes
  return new File([new Uint8Array(midi.toArray())], name, { type: 'audio/midi' });
}

/** Upload step of an import: choose the file, the study tracks and options, then create the score. */
describe('ImportWorkComponent flows', () => {
  let fixture: ComponentFixture<ImportWorkComponent>;
  let component: ImportWorkComponent;
  let el: HTMLElement;
  let scores: ScoreService;
  let navigate: ReturnType<typeof vi.spyOn>;
  let params: Record<string, string>;
  let navigationState: Record<string, unknown> | undefined;

  function render() {
    vi.spyOn(TestBed.inject(Router), 'getCurrentNavigation').mockReturnValue(
      navigationState ? { extras: { state: navigationState } } as never : null,
    );
    fixture = TestBed.createComponent(ImportWorkComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }
  async function waitFor(condition: () => boolean, timeout = 3000) {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeout) throw new Error('timed out waiting');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    fixture.detectChanges();
  }
  /** Picks a file in the drop zone, like a user; MIDI files are read, then their tracks listed. */
  async function pick(file: File) {
    const input = el.querySelector('#dropzone-file') as HTMLInputElement;
    const list = new DataTransfer();
    list.items.add(file);
    input.files = list.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    if (/\.midi?$/.test(file.name)) await waitFor(() => component.hasFile);
  }
  const trackRows = () => [...el.querySelectorAll('tbody tr')] as HTMLTableRowElement[];
  const studyBoxes = () => trackRows().map((r) => r.querySelector('input[type="checkbox"]') as HTMLInputElement);
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
  const modal = () => el.querySelector('[role="dialog"]') as HTMLElement | null;

  beforeEach(async () => {
    params = { mbid: 'w1' };
    navigationState = { work: WORK };
    await TestBed.configureTestingModule({
      imports: [ImportWorkComponent],
      providers: [...provideTesting(), { provide: ActivatedRoute, useFactory: () => ({ params: of(params) }) }],
    }).compileComponents();
    scores = TestBed.inject(ScoreService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('receives the chosen work from the previous step', () => {
    render();
    expect(component.work).toEqual(WORK);
    expect(component.mbid).toBe('w1');
  });

  it('shows an error passed by the previous step', () => {
    navigationState = { work: WORK, errorInfo: Object.assign(new Error('Score already exists'), { name: 'Duplicate' }) };
    render();
    expect(modal()?.textContent).toContain('Duplicate');
    button('Close').click();
    fixture.detectChanges();
    expect(modal()).toBeNull();
  });

  describe('choosing the study tracks of a MIDI file', () => {
    it('lists the tracks with notes, the drum track disabled', async () => {
      render();
      await pick(midiFile());
      expect(el.textContent).toContain('song.mid');
      expect(trackRows().map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent?.trim()))).toEqual([
        ['♩', '11', 'acoustic grand piano', 'Right', ''],
        ['♩', '3', 'acoustic grand piano', 'Left', ''],
        ['🥁', '1', 'standard kit', '-----------------', ''],
      ]);
      expect(studyBoxes()[2].disabled).toBe(true);
    });

    it('preselects the first two non-drum tracks as the two hands', async () => {
      render();
      await pick(midiFile());
      expect(studyBoxes().map((b) => b.checked)).toEqual([true, true, false]);
      expect(component.studies).toEqual([0, 1]);
    });

    it('allows at most two study tracks', async () => {
      const midi = scoreMidi(SIMPLE_SCORE);
      midi.addTrack().addNote({ midi: 80, ticks: 0, durationTicks: 480 });
      render();
      await pick(new File([new Uint8Array(midi.toArray())], 'three.mid'));
      const boxes = studyBoxes();
      expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([[true, false], [true, false], [false, false]]);

      boxes[1].click(); // uncheck the left hand
      fixture.detectChanges();
      expect(component.studies).toEqual([0]);
      boxes[2].click(); // pick the third track instead
      fixture.detectChanges();
      expect(component.studies).toEqual([2, 0]); // reversed: the higher track first
      expect(studyBoxes()[1].disabled).toBe(true); // two are chosen: the others are locked
    });

    it('offers to split the voices of a single study track', async () => {
      render();
      await pick(midiFile());
      expect(el.querySelector('#splitvoices')).toBeNull();
      studyBoxes()[1].click();
      fixture.detectChanges();
      const split = el.querySelector('#splitvoices') as HTMLInputElement;
      split.dispatchEvent(new Event('change'));
      expect(component.splitVoices).toBe(true);
    });

    it('Reset goes back to the drop zone', async () => {
      render();
      await pick(midiFile());
      button('reset').click();
      fixture.detectChanges();
      expect(el.querySelector('#dropzone-file')).not.toBeNull();
      expect(trackRows()).toHaveLength(0);
    });
  });

  describe('creating the score from a MIDI file', () => {
    beforeEach(() => {
      vi.spyOn(scores, 'scorePost').mockReturnValue(of({ id: 's1', version: 1, immutableSlug: 'hill-happy-birthday' }) as never);
    });

    it('creates the score with the study tracks, uploads the file, and opens the score', async () => {
      const upload = vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(of({}) as never);
      render();
      await pick(midiFile());
      button('load').click();
      expect(scores.scorePost).toHaveBeenCalledWith({
        mbid: 'w1', title: 'Happy Birthday', author_id: 'a1', author_name: 'Mildred J. Hill',
        study_tracks: [0, 1], hand_separated: false, type: 'mid',
      });
      const [id, type, version, revision, blob, track1, track2, fingering] = upload.mock.calls[0];
      expect([id, type, version, revision]).toEqual(['s1', 'midi', 1, 0]);
      expect((blob as Blob).size).toBeGreaterThan(0);
      expect([track1, track2]).toEqual([0, 1]); // track 0 is a real track, not "no track"
      expect(fingering).toBe(true);
      expect(navigate).toHaveBeenCalledWith(['/score', 'hill-happy-birthday']);
    });

    it('sends the fingering choice', async () => {
      const upload = vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(of({}) as never);
      render();
      await pick(midiFile());
      (el.querySelector('#makefingering') as HTMLInputElement).dispatchEvent(new Event('change'));
      button('load').click();
      expect(upload.mock.calls[0][7]).toBe(false);
    });

    it('treats a missing version as version 1', async () => {
      vi.mocked(scores.scorePost).mockReturnValue(of({ id: 's1', version: null, immutableSlug: 'x' }) as never);
      const upload = vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(of({}) as never);
      render();
      await pick(midiFile());
      button('load').click();
      expect(upload.mock.calls[0][2]).toBe(1);
    });

    it('looks the slug up when the new score came without one', async () => {
      vi.mocked(scores.scorePost).mockReturnValue(of({ id: 's1', version: 1 }) as never);
      vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(of({}) as never);
      const lookup = vi.spyOn(scores, 'scoreIdGet').mockReturnValue(of({ mutableSlug: 'draft' }) as never);
      render();
      await pick(midiFile());
      button('load').click();
      expect(lookup).toHaveBeenCalledWith('s1');
      expect(navigate).toHaveBeenCalledWith(['/score', 'draft']);
    });

    it('falls back to the library when the slug cannot be found', async () => {
      vi.mocked(scores.scorePost).mockReturnValue(of({ id: 's1', version: 1 }) as never);
      vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(of({}) as never);
      vi.spyOn(scores, 'scoreIdGet').mockReturnValue(throwError(() => new Error('404')) as never);
      render();
      await pick(midiFile());
      button('load').click();
      expect(navigate).toHaveBeenCalledWith(['/library']);
    });

    it('shows the server message when the score cannot be created', async () => {
      vi.mocked(scores.scorePost).mockReturnValue(throwError(() => ({ error: { error: { message: 'Work already imported' } } })) as never);
      render();
      await pick(midiFile());
      button('load').click();
      fixture.detectChanges();
      expect(modal()?.textContent).toContain('Creation Error');
      expect(component.modalContent).toBe('Work already imported');
      expect(component.loading).toBe(false);
    });

    it('shows an error when the upload fails', async () => {
      vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(throwError(() => new Error('413 Payload Too Large')) as never);
      render();
      await pick(midiFile());
      button('load').click();
      fixture.detectChanges();
      expect(modal()?.textContent).toContain('Upload Error');
      expect(component.modalContent).toBe('413 Payload Too Large');
    });

    it('refuses to create a score without a chosen work', async () => {
      navigationState = undefined;
      render();
      await pick(midiFile());
      button('load').click();
      fixture.detectChanges();
      expect(scores.scorePost).not.toHaveBeenCalled();
      expect(component.modalContent).toBe('No work information available.');
    });

    it('shows the loading indicator while uploading', async () => {
      vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(NEVER as never);
      render();
      await pick(midiFile());
      button('load').click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="import-progress"]')).not.toBeNull();
    });
  });

  describe('other file types', () => {
    it.each([
      ['sheet.pdf', 'pdf'],
      ['sheet.musicxml', 'musicxml'],
      ['sheet.mxl', 'mxl'],
      ['photo.png', 'image'],
      ['photo.jpg', 'image'],
      ['photo.jpeg', 'image'],
    ])('uploads %s right away as %s', async (name, type) => {
      const post = vi.spyOn(scores, 'scorePost').mockReturnValue(of({ id: 's1', version: 1, immutableSlug: 'x' }) as never);
      const upload = vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(of({}) as never);
      render();
      await pick(new File(['data'], name));
      expect(post.mock.calls[0][0]).toMatchObject({ type });
      expect(upload.mock.calls[0][1]).toBe(type);
    });

    it('ignores other files', async () => {
      const post = vi.spyOn(scores, 'scorePost');
      render();
      await pick(new File(['data'], 'notes.txt'));
      expect(post).not.toHaveBeenCalled();
    });

    it('getFileType recognizes MIDI too', () => {
      render();
      expect([component.getFileType('a.mid'), component.getFileType('a.midi')]).toEqual(['midi', 'midi']);
    });
  });

  describe('opening a bundled MIDI file (/import/import-work/:mbid?filename=)', () => {
    // The spec files share one window: a fetch stub left behind breaks later specs that really fetch
    // (the blog's "body stream already read"), so restore it, and give each call its own Response.
    afterEach(() => vi.restoreAllMocks());

    it('loads it from assets/midi and lists its tracks', async () => {
      const bytes = await midiFile().arrayBuffer();
      const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(bytes));
      params = { mbid: 'w1', filename: 'demo.mid' };
      render();
      await waitFor(() => component.hasFile);
      expect(fetchSpy).toHaveBeenCalledWith('/assets/midi/demo.mid');
      expect(component.fileName).toBe('demo.mid');
      expect(trackRows()).toHaveLength(3);
    });

    it('shows an error when it cannot be loaded', async () => {
      vi.spyOn(window, 'fetch').mockImplementation(async () => new Response('', { status: 404, statusText: 'Not Found' }));
      params = { mbid: 'w1', filename: 'missing.mid' };
      render();
      await waitFor(() => component.isModalOpen);
      expect(component.modalContent).toContain('Not Found');
    });

    it('also accepts the file name as an input', async () => {
      const bytes = await midiFile().arrayBuffer();
      vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(bytes));
      fixture = TestBed.createComponent(ImportWorkComponent);
      fixture.componentRef.setInput('fileParam', 'input.mid');
      component = fixture.componentInstance;
      el = fixture.nativeElement;
      fixture.detectChanges();
      await waitFor(() => component.hasFile);
      expect(component.fileName).toBe('input.mid');
    });
  });

  it('reverseInPlace reverses an array', () => {
    render();
    expect(component.reverseInPlace([1, 2, 3])).toEqual([3, 2, 1]);
    expect(component.reverseInPlace([])).toEqual([]);
  });
});
