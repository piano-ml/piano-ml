import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTesting } from '../../../testing/test-providers';
import { AuthService } from '../../services/auth.service';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let el: HTMLElement;
  let request: ReturnType<typeof vi.spyOn>;

  async function create(state: unknown = null) {
    history.replaceState(state, '');
    await TestBed.configureTestingModule({ imports: [ForgotPasswordComponent], providers: provideTesting() }).compileComponents();
    request = vi.spyOn(TestBed.inject(AuthService), 'requestPasswordReset').mockReturnValue(of(undefined) as never);
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  const input = () => el.querySelector('#email') as HTMLInputElement;
  const button = () => el.querySelector('button[type="submit"]') as HTMLButtonElement;
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';

  function type(value: string) {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    input().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  afterEach(() => history.replaceState(null, ''));

  it('starts with the email typed on the login page', async () => {
    await create({ email: 'lily@example.com' });
    expect(input().value).toBe('lily@example.com');
    expect(button().disabled).toBe(false);
  });

  it('needs a valid email', async () => {
    await create();
    expect(button().disabled).toBe(true);
    type('not-an-email');
    expect(text()).toContain('Please enter a valid email.');
    expect(button().disabled).toBe(true);
  });

  it('asks for a link, then says to check the email, whatever the account', async () => {
    await create();
    type(' lily@example.com ');
    button().click();
    fixture.detectChanges();

    expect(request).toHaveBeenCalledWith('lily@example.com');
    expect(text()).toContain('If an account uses lily@example.com, we have sent it a link to choose a new password.');
    expect(el.querySelector('form')).toBeNull();
  });

  it('cannot be sent twice while sending', async () => {
    await create();
    request.mockReturnValue(NEVER as never);
    type('lily@example.com');
    button().click();
    fixture.detectChanges();

    expect(button().disabled).toBe(true);
    expect(text()).toContain('Sending...');
  });

  it('says when the email could not be sent, and lets the user try again', async () => {
    await create();
    request.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })) as never);
    type('lily@example.com');
    button().click();
    fixture.detectChanges();

    expect(text()).toContain('The email could not be sent. Please try again in a moment.');
    expect(button().disabled).toBe(false);
  });
});
