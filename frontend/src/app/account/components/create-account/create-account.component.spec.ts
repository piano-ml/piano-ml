import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideTesting } from '../../../testing/test-providers';
import { AuthService } from '../../services/auth.service';
import { CreateAccountComponent } from './create-account.component';

describe('CreateAccountComponent', () => {
  let component: CreateAccountComponent;
  let fixture: ComponentFixture<CreateAccountComponent>;
  let el: HTMLElement;
  let register: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const VALID = { name: 'Alice', email: 'alice@example.com', password: 'Secret-pass-42', confirmPassword: 'Secret-pass-42' };

  /** Types into a field like a user (input event, then blur so "touched" errors show). */
  function type(id: string, value: string) {
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  function fill(values: Partial<typeof VALID> = {}) {
    for (const [id, value] of Object.entries({ ...VALID, ...values })) type(id, value);
  }

  const submitButton = () => el.querySelector('button[type="submit"]') as HTMLButtonElement;
  const errors = () => [...el.querySelectorAll('.text-error')].map((e) => e.textContent?.trim());
  /** Which of the three strength bars is lit. */
  const strength = () => ['weak', 'medium', 'strong'].filter((s) => el.querySelector(`.bg-strength-${s}`));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateAccountComponent],
      providers: provideTesting(),
    }).compileComponents();
    register = vi.spyOn(TestBed.inject(AuthService), 'register').mockReturnValue(of({}) as never);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(CreateAccountComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  describe('validation', () => {
    it('keeps "Create Account" disabled until the form is complete', () => {
      expect(submitButton().disabled).toBe(true);
      fill();
      expect(submitButton().disabled).toBe(false);
    });

    it('requires a name', () => {
      fill({ name: '' });
      expect(errors()).toContain('name is required.');
      expect(submitButton().disabled).toBe(true);
    });

    it('rejects a malformed email', () => {
      fill({ email: 'not-an-email' });
      expect(errors()).toContain('Invalid email format.');
      expect(submitButton().disabled).toBe(true);
    });

    it('requires an email', () => {
      fill({ email: '' });
      expect(errors()).toContain('Email is required.');
    });

    it('requires at least 8 password characters', () => {
      fill({ password: 'Short1', confirmPassword: 'Short1' });
      expect(errors()).toContain('Password must be at least 8 characters long.');
      expect(submitButton().disabled).toBe(true);
    });

    it('requires both passwords to match', () => {
      fill({ confirmPassword: 'Something-else-42' });
      expect(errors()).toContain('Passwords do not match.');
      expect(submitButton().disabled).toBe(true);

      type('confirmPassword', VALID.password);
      expect(errors()).not.toContain('Passwords do not match.');
      expect(submitButton().disabled).toBe(false);
    });
  });

  describe('password strength meter', () => {
    it('lights nothing before typing', () => {
      expect(strength()).toEqual([]);
    });

    it.each([
      ['abc', 'weak'],
      ['abcdefgh', 'weak'], // long enough but a single character class
      ['abcdefg1', 'medium'],
      ['ABCDEFGh', 'medium'],
      ['Abcdefgh1234', 'strong'],
      ['Abcdefgh123', 'medium'], // 11 characters: not long enough for strong
    ])('"%s" is %s', (password, expected) => {
      type('password', password);
      expect(strength()).toEqual([expected]);
    });
  });

  describe('submitting', () => {
    it('registers the account and goes to login, keeping the returnUrl', () => {
      fill();
      submitButton().click();
      expect(register).toHaveBeenCalledWith(VALID);
      expect(navigate).toHaveBeenCalledWith(['/account/login'], { queryParamsHandling: 'preserve' });
    });

    it('goes to the error page when the registration fails', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      register.mockReturnValue(throwError(() => new Error('email taken')) as never);
      fill();
      submitButton().click();
      expect(navigate).toHaveBeenCalledWith(['/error']);
    });

    it('does not register an invalid form', () => {
      fill({ email: 'nope' });
      component.onSubmit();
      expect(register).not.toHaveBeenCalled();
    });
  });
});
