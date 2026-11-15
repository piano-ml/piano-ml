import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';
import type { ScoreApiInfo } from '../../../core/api';
import { ScoreService } from '../../../core/api/api/score.service';
import { provideTesting } from '../../../testing/test-providers';
import { SlopDialogComponent, repairErrorMessage } from './slop-dialog.component';

const SCORE = { id: 's1', version: 2, owner_id: 'owner-1', title: 'Gymnopédie' } as ScoreApiInfo;

/** Shown when a score's sheet music and sound don't line up: its owner can ask the server to rebuild it. */
describe('SlopDialogComponent', () => {
  let fixture: ComponentFixture<SlopDialogComponent>;
  let el: HTMLElement;
  let scores: ScoreService;
  let auth: AuthService;
  let close: ReturnType<typeof vi.fn>;

  function render({ userId = 'owner-1' as string | null, admin = false, score = SCORE as ScoreApiInfo | null } = {}) {
    vi.spyOn(auth, 'getUserId').mockReturnValue(userId);
    vi.spyOn(auth, 'isAdmin').mockReturnValue(admin);
    fixture = TestBed.createComponent(SlopDialogComponent);
    el = fixture.nativeElement;
    fixture.componentRef.setInput('show', true);
    fixture.componentRef.setInput('scoreData', score);
    fixture.componentRef.setInput('close', close);
    fixture.detectChanges();
  }
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  const midiFile = () => of({ arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Blob);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SlopDialogComponent], providers: provideTesting() }).compileComponents();
    scores = TestBed.inject(ScoreService);
    auth = TestBed.inject(AuthService);
    close = vi.fn();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('renders nothing while hidden', () => {
    fixture = TestBed.createComponent(SlopDialogComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('explains the encoding issue', () => {
    render();
    expect(el.textContent).toContain('Encoding issue detected');
    expect(el.textContent).toContain('A 4/4 bar with 5 quarter notes');
  });

  describe('who can repair', () => {
    it('the owner of the score', () => {
      render({ userId: 'owner-1' });
      expect(button('Repair')).toBeDefined();
    });

    it('an admin', () => {
      render({ userId: 'someone-else', admin: true });
      expect(button('Repair')).toBeDefined();
    });

    it('not another user, nor a visitor', () => {
      render({ userId: 'someone-else' });
      expect(button('Repair')).toBeUndefined();
      fixture.destroy();
      render({ userId: null });
      expect(button('Repair')).toBeUndefined();
    });
  });

  describe('repairing', () => {
    it('downloads the MIDI file, re-uploads it for processing, then says so in the dialog (no alert)', async () => {
      const get = vi.spyOn(scores, 'scoreOwnerIdTypeVersionRevisionGet').mockReturnValue(midiFile() as never);
      const post = vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(of({}) as never);
      render();
      await fixture.componentInstance.repair();
      fixture.detectChanges();

      expect(get).toHaveBeenCalledWith('owner-1', 's1', 'midi', 2, 1);
      const args = post.mock.calls[0];
      expect([args[0], args[1], args[2], args[3]]).toEqual(['s1', 'midi', 2, 0]);
      expect((args[4] as Blob).type).toBe('audio/midi');
      expect(args[7]).toBe(true); // with automatic fingering
      expect(window.alert).not.toHaveBeenCalled();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('The score has been rebuilt');
      expect(button('Repair')).toBeUndefined();
      expect(close).not.toHaveBeenCalled();

      const reload = vi.spyOn(fixture.componentInstance, 'reload').mockImplementation(() => undefined);
      button('Reload')?.click();
      expect(reload).toHaveBeenCalledOnce();
    });

    it('ignores a second click while repairing', async () => {
      const get = vi.spyOn(scores, 'scoreOwnerIdTypeVersionRevisionGet').mockReturnValue(NEVER as never);
      render();
      void fixture.componentInstance.repair();
      void fixture.componentInstance.repair();
      expect(get).toHaveBeenCalledOnce();
    });

    it('shows progress and disables Close while working', () => {
      vi.spyOn(scores, 'scoreOwnerIdTypeVersionRevisionGet').mockReturnValue(NEVER as never);
      render();
      button('Repair')?.click();
      fixture.detectChanges();
      expect(el.textContent).toContain('Downloading...');
      expect(button('Close')?.disabled).toBe(true);
      expect(button('Repair')).toBeUndefined();
    });

    it.each([
      ['download', () => throwError(() => new HttpErrorResponse({ status: 404 })), () => of({}),
        'The MIDI file of this score could not be downloaded. The file is not available.'],
      ['upload', midiFile, () => throwError(() => new HttpErrorResponse({ status: 500 })),
        'The server could not rebuild this score. Please try again later.'],
      ['MIDI read', () => of({ arrayBuffer: async () => { throw new Error('corrupt'); } }), () => of({}),
        'The MIDI file of this score could not be read. Please try again later.'],
    ])('reports a failed %s in the dialog, stays open and offers to try again', async (_step, download, upload, message) => {
      vi.spyOn(scores, 'scoreOwnerIdTypeVersionRevisionGet').mockReturnValue(download() as never);
      vi.spyOn(scores, 'scoreIdTypeVersionRevisionPost').mockReturnValue(upload() as never);
      render();
      await fixture.componentInstance.repair();
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message);
      expect(window.alert).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(button('Close')?.disabled).toBe(false);
      expect(button('Try again')).toBeDefined();
    });

    it('words connection, login and permission problems', () => {
      const err = (status: number) => new HttpErrorResponse({ status });
      expect(repairErrorMessage('download', err(0))).toContain('check your connection');
      expect(repairErrorMessage('upload', err(401))).toBe('The server could not rebuild this score. Please log in again.');
      expect(repairErrorMessage('upload', err(403))).toBe('The server could not rebuild this score. You are not allowed to repair this score.');
    });

    it('does nothing for an incomplete score', async () => {
      const get = vi.spyOn(scores, 'scoreOwnerIdTypeVersionRevisionGet');
      render({ score: { id: 's1' } as ScoreApiInfo });
      await fixture.componentInstance.repair();
      expect(get).not.toHaveBeenCalled();
    });
  });

  it('closes with Close or a click on the backdrop, not inside', () => {
    render();
    (el.querySelector('.modal-content') as HTMLElement).click();
    expect(close).not.toHaveBeenCalled();
    (el.querySelector('.modal') as HTMLElement).click();
    button('Close')?.click();
    expect(close).toHaveBeenCalledTimes(2);
  });
});
