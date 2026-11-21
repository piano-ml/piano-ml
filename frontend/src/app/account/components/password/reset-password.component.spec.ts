import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTesting } from '../../../testing/test-providers';
import { AuthService } from '../../services/auth.service';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let el: HTMLElement;
  let reset: ReturnType<typeof vi.spyOn>;
  let replaceState: ReturnType<typeof vi.spyOn>;

  async function create(token: string | null) {
    await TestBed.configureTestingModule({ imports: [ResetPasswordComponent], providers: provideTesting() }).compileComponents();
    const route = TestBed.inject(ActivatedRoute);
    vi.spyOn(route.snapshot.queryParamMap, 'get').mockImplementation((key) =>
      convertToParamMap(token === null ? {} : { token }).get(key));
    const location = TestBed.inject(Location);
    vi.spyOn(location, 'path').mockReturnValue(`/account/reset-password?token=${token}`);
    replaceState = vi.spyOn(location, 'replaceState').mockImplementation(() => undefined);
    reset = vi.spyOn(TestBed.inject(AuthService), 'resetPassword').mockReturnValue(of(undefined) as never);
    fixture = TestBed.createComponent(ResetPasswordComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = () => el.querySelector('button[type="submit"]') as HTMLButtonElement;

  function type(id: string, value: string) {
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  function fill(password: string, confirm = password) {
    type('password', password);
    type('confirmPassword', confirm);
  }

  it('takes the token out of the address bar', async () => {
    await create('abc');
    expect(replaceState).toHaveBeenCalledWith('/account/reset-password');
  });

  it('sets the new password with the token, then offers to log in', async () => {
    await create('abc');
    fill('new-password');
    button().click();
    fixture.detectChanges();

    expect(reset).toHaveBeenCalledWith('abc', 'new-password');
    expect(text()).toContain('Your password has been changed.');
    expect(el.querySelector('a[href="/account/login"]')).not.toBeNull();
  });

  it('needs 8 characters and the same password twice', async () => {
    await create('abc');
    fill('short');
    expect(text()).toContain('Password must be at least 8 characters long.');
    expect(button().disabled).toBe(true);

    fill('new-password', 'other-password');
    expect(text()).toContain('Passwords do not match.');
    expect(button().disabled).toBe(true);

    type('confirmPassword', 'new-password');
    expect(text()).not.toContain('Passwords do not match.');
    expect(button().disabled).toBe(false);
  });

  it('offers a new link when the link is invalid or expired', async () => {
    await create('abc');
    reset.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'invalid_token' } })) as never);
    fill('new-password');
    button().click();
    fixture.detectChanges();

    expect(text()).toContain('This link is invalid or has expired');
    expect(el.querySelector('a[href="/account/forgot-password"]')).not.toBeNull();
  });

  it('says so at once without a token', async () => {
    await create(null);
    expect(text()).toContain('This link is invalid or has expired');
    expect(el.querySelector('form')).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('keeps the form on another failure', async () => {
    await create('abc');
    reset.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })) as never);
    fill('new-password');
    button().click();
    fixture.detectChanges();

    expect(text()).toContain('The password could not be changed. Please try again in a moment.');
    expect(el.querySelector('form')).not.toBeNull();
  });
});
