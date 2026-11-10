import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
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
