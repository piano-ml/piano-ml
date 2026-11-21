import { TestBed } from '@angular/core/testing';
import { provideTesting } from './testing/test-providers';
import { AppComponent } from './app.component';
import { BeaconService } from 'ng-beacon';

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

  describe('tours', () => {
    const enter = () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
      document.dispatchEvent(event);
      return event;
    };

    it('Enter goes to the next step of any tour (the calibration\'s too), without clicking a focused button', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const beacon = TestBed.inject(BeaconService);
      // Steps without a target: the handler is the same for every tour, whatever it points at
      beacon.start([
        { id: 'one', title: 'One', content: 'First', showWithoutTarget: true },
        { id: 'two', title: 'Two', content: 'Second', showWithoutTarget: true },
        { id: 'three', title: 'Three', content: 'Third', showWithoutTarget: true },
      ] as never);
      expect(beacon.currentStepIndex()).toBe(0);

      const event = enter();
      expect(beacon.currentStepIndex()).toBe(1);
      expect(event.defaultPrevented).toBe(true);
      beacon.stop();
    });

    it('Enter does nothing without a tour', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(enter().defaultPrevented).toBe(false);
    });
  });
});
