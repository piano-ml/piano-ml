import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
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
});
