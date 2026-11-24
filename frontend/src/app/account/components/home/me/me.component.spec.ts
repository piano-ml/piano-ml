import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AccountMeComponent } from './me.component';
import { AuthService } from '../../../services/auth.service';

describe('AccountMeComponent — delete account', () => {
  let fixture: ComponentFixture<AccountMeComponent>;
  let component: AccountMeComponent;
  let el: HTMLElement;
  let authService: {
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
      getUserInfo: vi.fn(() => of({ name: 'Alice', email: 'alice@example.com' })),
      updateUserInfo: vi.fn(() => of(undefined)),
      logout: vi.fn(),
      deleteAccount: vi.fn(() => of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [AccountMeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AccountMeComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    render();
  });

  it('offers "Delete account" then "Logout"', () => {
    const labels = Array.from(query('account-actions' as string)!.children).map(node => node.textContent!.trim());
    expect(labels).toEqual(['Delete account', 'Logout']);
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

describe('AccountMeComponent — profile', () => {
  let fixture: ComponentFixture<AccountMeComponent>;
  let component: AccountMeComponent;
  let el: HTMLElement;
  let authService: {
    getUserInfo: ReturnType<typeof vi.fn>;
    updateUserInfo: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [AccountMeComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AccountMeComponent);
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

  beforeEach(() => {
    authService = {
      getUserInfo: vi.fn(() => of({ name: 'Alice', email: 'alice@example.com' })),
      updateUserInfo: vi.fn(() => of(undefined)),
      logout: vi.fn(),
      deleteAccount: vi.fn(() => of(undefined)),
    };
  });

  describe('session', () => {
    it('shows the user email and name', async () => {
      await setup();
      expect(el.textContent).toContain('alice@example.com');
      expect(el.textContent).toContain('Alice');
    });

    it('Logout logs out and goes to plain login', async () => {
      await setup();
      buttons('Logout')[0].click();
      expect(authService.logout).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(['/account/login']);
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

});
