import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { provideTesting } from '../../../testing/test-providers';

import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: provideTesting()
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('after a successful login', () => {
    function loginWith(returnUrl: string | null) {
      const route = TestBed.inject(ActivatedRoute);
      vi.spyOn(route.snapshot.queryParamMap, 'get').mockImplementation((key) =>
        convertToParamMap(returnUrl === null ? {} : { returnUrl }).get(key));
      vi.spyOn(TestBed.inject(AuthService), 'login').mockReturnValue(of({}) as never);
      const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      component.loginForm.setValue({ email: 'a@example.com', password: 'pw' });
      component.onSubmit();
      return navigateByUrl;
    }

    it('goes back to the page the user came from', () => {
      expect(loginWith('/score/hanon-no-19')).toHaveBeenCalledWith('/score/hanon-no-19');
    });

    it('goes to the homepage without a returnUrl', () => {
      expect(loginWith(null)).toHaveBeenCalledWith('/');
    });

    it('ignores a returnUrl pointing to another site', () => {
      expect(loginWith('https://evil.example')).toHaveBeenCalledWith('/');
    });
  });

  describe('form and errors', () => {
    let el: HTMLElement;
    let login: ReturnType<typeof vi.spyOn>;

    function fillAndSubmit(email = 'a@example.com', password = 'pw') {
      component.loginForm.setValue({ email, password });
      fixture.detectChanges();
      (el.querySelector('button[type="submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    }
    const alert = () => el.querySelector('.alert-error') as HTMLElement | null;

    beforeEach(() => {
      el = fixture.nativeElement;
      login = vi.spyOn(TestBed.inject(AuthService), 'login');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('keeps Login disabled until both fields are filled', () => {
      const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      component.loginForm.setValue({ email: 'a@example.com', password: '' });
      fixture.detectChanges();
      expect(button.disabled).toBe(true);
    });

    it('shows "Logging in..." and disables the button while waiting', () => {
      login.mockReturnValue(NEVER as never);
      fillAndSubmit();
      const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(button.textContent).toContain('Logging in...');
      expect(button.disabled).toBe(true);
    });

    it('says the credentials were refused on 403', () => {
      login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })) as never);
      fillAndSubmit();
      expect(alert()?.textContent).toContain('Access denied - Please check your credentials');
      expect(component.isLoading).toBe(false);
    });

    it("shows the server's own message for other errors", () => {
      login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Database down' } })) as never);
      fillAndSubmit();
      expect(alert()?.textContent).toContain('Database down');
    });

    it('falls back to a generic message', () => {
      login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })) as never);
      fillAndSubmit();
      expect(alert()?.textContent).toContain('An error occurred during login');
    });

    it('dismisses the error when clicked', () => {
      login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })) as never);
      fillAndSubmit();
      alert()?.click();
      fixture.detectChanges();
      expect(alert()).toBeNull();
    });

    it('does not call the API with an incomplete form', () => {
      component.loginForm.setValue({ email: '', password: 'pw' });
      component.onSubmit();
      expect(login).not.toHaveBeenCalled();
    });

    it('shows "required" hints once a field is left empty', () => {
      for (const id of ['email', 'password']) {
        el.querySelector(`#${id}`)?.dispatchEvent(new Event('blur'));
      }
      fixture.detectChanges();
      const hints = [...el.querySelectorAll('.text-error')].map((e) => e.textContent?.trim());
      expect(hints).toEqual(['email is required.', 'Password is required.']);
    });
  });
});
