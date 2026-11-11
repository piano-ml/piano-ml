import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AccountHomeComponent } from './home.component';
import { AuthService } from '../../services/auth.service';
import { MidiServiceService } from '../../../shared/services/midi-service.service';
import { MidiSetupComponent } from '../../../desktop/components/midi-setup/midi-setup.component';

@Component({ selector: 'app-midi-setup', standalone: true, template: '' })
class MidiSetupStubComponent {
  @Input() isOpen = false;
  @Input() hideKeyboard = false;
  @Output() hideKeyboardChange = new EventEmitter<boolean>();
  @Output() closeModal = new EventEmitter<void>();
}

describe('AccountHomeComponent — delete account', () => {
  let fixture: ComponentFixture<AccountHomeComponent>;
  let component: AccountHomeComponent;
  let el: HTMLElement;
  let authService: {
    isLoggedIn: unknown;
    getUserInfo: ReturnType<typeof vi.fn>;
    updateUserInfo: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const query = (testId: string) => el.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  const render = () => fixture.detectChanges();
  const dialog = () => el.querySelector('[role="dialog"]');
  const click = (testId: string) => {
    query(testId)!.click();
    render();
  };

  beforeEach(async () => {
    authService = {
      isLoggedIn: of(true),
      getUserInfo: vi.fn(() => of({ name: 'Alice', email: 'alice@example.com' })),
      updateUserInfo: vi.fn(() => of(undefined)),
      logout: vi.fn(),
      deleteAccount: vi.fn(() => of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [AccountHomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: MidiServiceService, useValue: { midiEvent: signal(null) } },
      ],
    })
      .overrideComponent(AccountHomeComponent, {
        remove: { imports: [MidiSetupComponent] },
        add: { imports: [MidiSetupStubComponent] },
      })
      .compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AccountHomeComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    render();
  });

  it('places "Delete account" between "My Scores" and "Logout"', () => {
    const toolbar = query('delete-account')!.parentElement!;
    const labels = Array.from(toolbar.children).map(node => node.textContent!.trim());
    expect(labels).toEqual(['My Scores', 'Delete account', 'Logout']);
  });

  it('opens a confirmation modal without calling the backend', () => {
    expect(dialog()).toBeNull();

    click('delete-account');

    expect(dialog()).not.toBeNull();
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(dialog()!.textContent).toContain('This action cannot be undone');
    expect(dialog()!.textContent).toContain('Your scores are kept');
    expect(authService.deleteAccount).not.toHaveBeenCalled();
  });

  it('cancel closes the modal and deletes nothing', () => {
    click('delete-account');

    click('delete-cancel');

    expect(dialog()).toBeNull();
    expect(authService.deleteAccount).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('confirm deletes the account, then logs out', () => {
    click('delete-account');

    click('delete-confirm');

    expect(authService.deleteAccount).toHaveBeenCalledOnce();
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/account/login']);
    expect(dialog()).toBeNull();
  });

  it('shows "Deleting…" and ignores repeated confirm or cancel while the request runs', () => {
    const pending = new Subject<void>();
    authService.deleteAccount.mockReturnValue(pending);
    click('delete-account');

    click('delete-confirm');
    expect(query('delete-confirm')!.textContent).toContain('Deleting…');
    expect(query('delete-confirm')!.disabled).toBe(true);
    expect(query('delete-cancel')!.disabled).toBe(true);

    component.confirmDeleteAccount();
    component.cancelDeleteAccount();
    expect(authService.deleteAccount).toHaveBeenCalledOnce();
    expect(component.showDeleteConfirmation).toBe(true);

    pending.next();
    pending.complete();
    render();
    expect(authService.logout).toHaveBeenCalledOnce();
  });

  it('a failure keeps the modal open with an error and does not log out', () => {
    authService.deleteAccount.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    click('delete-account');

    click('delete-confirm');

    expect(query('delete-error')!.textContent).toContain('Account deletion failed. Please try again.');
    expect(dialog()).not.toBeNull();
    expect(query('delete-confirm')!.disabled).toBe(false);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('a CSRF rejection (after the interceptor retry) asks for a reload', () => {
    authService.deleteAccount.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { error: 'CSRF_TOKEN_INVALID' } })));
    click('delete-account');

    click('delete-confirm');

    expect(query('delete-error')!.textContent).toContain('Please reload the page and try again.');
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('reopening the modal clears the previous error', () => {
    authService.deleteAccount.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    click('delete-account');
    click('delete-confirm');
    click('delete-cancel');

    click('delete-account');

    expect(query('delete-error')).toBeNull();
  });
});

describe('AccountHomeComponent — profile and preferences', () => {
  let fixture: ComponentFixture<AccountHomeComponent>;
  let component: AccountHomeComponent;
  let el: HTMLElement;
  let loggedIn: BehaviorSubject<boolean>;
  let midiEvent: ReturnType<typeof signal<unknown>>;
  let authService: {
    isLoggedIn: unknown;
    getUserInfo: ReturnType<typeof vi.fn>;
    updateUserInfo: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [AccountHomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: MidiServiceService, useValue: { midiEvent } },
      ],
    })
      .overrideComponent(AccountHomeComponent, {
        remove: { imports: [MidiSetupComponent] },
        add: { imports: [MidiSetupStubComponent] },
      })
      .compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AccountHomeComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  const render = () => fixture.detectChanges();
  const buttons = (text: string) => [...el.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text);
  const input = (id: string) => el.querySelector(`#${id}`) as HTMLInputElement;
  function type(id: string, value: string) {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
    input(id).dispatchEvent(new Event('blur'));
    render();
  }
  const storedPreferences = () => JSON.parse(localStorage.getItem('preferences') ?? 'null');

  beforeEach(() => {
    localStorage.clear();
    loggedIn = new BehaviorSubject(true);
    midiEvent = signal<unknown>(null);
    authService = {
      isLoggedIn: loggedIn,
      getUserInfo: vi.fn(() => of({ name: 'Alice', email: 'alice@example.com' })),
      updateUserInfo: vi.fn(() => of(undefined)),
      logout: vi.fn(),
      deleteAccount: vi.fn(() => of(undefined)),
    };
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => localStorage.clear());

  describe('session', () => {
    it('shows the user email and name', async () => {
      await setup();
      expect(el.textContent).toContain('alice@example.com');
      expect(el.textContent).toContain('Alice');
    });

    it('sends a logged-out visitor to login, remembering the page', async () => {
      loggedIn.next(false);
      await setup();
      expect(navigate).toHaveBeenCalledWith(['/account/login'], expect.objectContaining({ queryParams: expect.any(Object) }));
    });

    it('goes to login when the session ends while on the page', async () => {
      await setup();
      expect(navigate).not.toHaveBeenCalled();
      loggedIn.next(false);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('Logout logs out and goes to plain login', async () => {
      await setup();
      buttons('Logout')[0].click();
      expect(authService.logout).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(['/account/login']);
    });

    it('stops listening to the session once destroyed', async () => {
      await setup();
      fixture.destroy();
      loggedIn.next(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('editing the name', () => {
    it('saves the new name and leaves edit mode', async () => {
      await setup();
      buttons('Edit')[0].click();
      render();
      expect(input('name').value).toBe('Alice');

      type('name', 'Alice Cooper');
      buttons('Save')[0].click();
      render();
      expect(authService.updateUserInfo).toHaveBeenCalledWith({ name: 'Alice Cooper' });
      expect(input('name')).toBeNull();
      expect(el.textContent).toContain('Alice Cooper');
    });

    it('Cancel restores the previous name', async () => {
      await setup();
      buttons('Edit')[0].click();
      render();
      type('name', 'Typo');
      buttons('Cancel')[0].click();
      render();
      expect(authService.updateUserInfo).not.toHaveBeenCalled();
      expect(component.nameForm.value.name).toBe('Alice');
      expect(el.textContent).not.toContain('Typo');
    });
  });

  describe('keyboard preferences', () => {
    it('defaults to the full 88-key range, fingering, lyrics and keyboard on', async () => {
      await setup();
      expect(component.keyboardPreferencesForm.value).toEqual({
        leftmostKey: 21, rightmostKey: 108, drawFingering: true, drawLyrics: true, showKeyboard: true,
      });
    });

    it('loads the stored preferences, defaulting missing ones', async () => {
      localStorage.setItem('preferences', JSON.stringify({ leftmostKey: 36, drawLyrics: false }));
      await setup();
      expect(component.keyboardPreferencesForm.value).toEqual({
        leftmostKey: 36, rightmostKey: 108, drawFingering: true, drawLyrics: false, showKeyboard: true,
      });
    });

    it('ignores corrupted stored preferences', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      localStorage.setItem('preferences', '{not json');
      await setup();
      expect(component.leftmostKeyValue).toBe(21);
      expect(component.rightmostKeyValue).toBe(108);
    });

    it('saves edited preferences to localStorage', async () => {
      await setup();
      buttons('Edit')[1].click();
      render();
      type('leftmostKey', '36');
      type('rightmostKey', '96');
      input('drawLyrics').click();
      render();
      buttons('Save')[0].click();
      render();
      expect(storedPreferences()).toEqual({
        leftmostKey: 36, rightmostKey: 96, drawFingering: true, drawLyrics: false, showKeyboard: true,
      });
      expect(component.keyboardEditMode).toBe(false);
    });

    it.each([
      ['leftmostKey', '20', 'Min 21.'],
      ['rightmostKey', '109', 'Max 108.'],
      ['leftmostKey', '', 'Required.'],
    ])('rejects %s = %j', async (id, value, message) => {
      await setup();
      buttons('Edit')[1].click();
      render();
      type(id, value);
      expect(el.textContent).toContain(message);
      expect(buttons('Save')[0].disabled).toBe(true);
    });

    it('requires the lowest key to be below the highest', async () => {
      await setup();
      buttons('Edit')[1].click();
      render();
      type('leftmostKey', '80');
      type('rightmostKey', '60');
      expect(el.textContent).toContain('Lowest key must be less than highest key.');
      expect(buttons('Save')[0].disabled).toBe(true);
    });

    it('does not save an invalid form', async () => {
      await setup();
      component.enableKeyboardEdit();
      component.keyboardPreferencesForm.patchValue({ leftmostKey: 5 });
      component.savePreferences();
      expect(storedPreferences()).toBeNull();
      expect(component.keyboardEditMode).toBe(true);
    });

    it('Cancel restores the stored values', async () => {
      localStorage.setItem('preferences', JSON.stringify({ leftmostKey: 36, rightmostKey: 96 }));
      await setup();
      component.enableKeyboardEdit();
      render();
      component.keyboardPreferencesForm.patchValue({ leftmostKey: 48 });
      buttons('Cancel')[0].click();
      expect(component.keyboardEditMode).toBe(false);
      expect(component.leftmostKeyValue).toBe(36);
    });

    it('opens MIDI Setup, which can hide the keyboard, and closes it', async () => {
      await setup();
      const dialog = fixture.debugElement.query(By.directive(MidiSetupStubComponent)).componentInstance as MidiSetupStubComponent;
      expect(dialog.isOpen).toBe(false);

      buttons('MIDI Setup →')[0].click();
      render();
      expect(dialog.isOpen).toBe(true);
      expect(dialog.hideKeyboard).toBe(false);

      dialog.hideKeyboardChange.emit(true);
      render();
      expect(component.showKeyboardControl?.value).toBe(false);
      expect(dialog.hideKeyboard).toBe(true);

      dialog.closeModal.emit();
      render();
      expect(dialog.isOpen).toBe(false);
    });
  });

  describe('setting the key range by playing notes', () => {
    it('ignores the MIDI keyboard outside edit mode', async () => {
      await setup();
      midiEvent.set({ type: 'down', note: 40 });
      render();
      expect(component.leftmostKeyValue).toBe(21);
    });

    it('in edit mode, a low note sets the lowest key and a high note the highest', async () => {
      await setup();
      buttons('Edit')[1].click();
      render();
      midiEvent.set({ type: 'down', note: 40 });
      render();
      expect(input('leftmostKey').value).toBe('40');
      midiEvent.set({ type: 'down', note: 84 });
      render();
      expect(input('rightmostKey').value).toBe('84');
    });

    it('ignores key releases', async () => {
      await setup();
      component.enableKeyboardEdit();
      midiEvent.set({ type: 'up', note: 40 });
      render();
      expect(component.leftmostKeyValue).toBe(21);
    });

    it('stops listening after saving', async () => {
      await setup();
      component.enableKeyboardEdit();
      component.savePreferences();
      midiEvent.set({ type: 'down', note: 40 });
      render();
      expect(component.leftmostKeyValue).toBe(21);
    });
  });
});

