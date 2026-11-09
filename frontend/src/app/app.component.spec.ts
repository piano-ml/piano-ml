import { TestBed } from '@angular/core/testing';
import { provideTesting } from './testing/test-providers';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: provideTesting()
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it(`should have the 'piano-ml' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);

    expect(fixture.componentInstance.title).toEqual('piano-ml');
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).toBeTruthy();
  });
});
