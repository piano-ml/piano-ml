import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TempoControlComponent } from './tempo-control.component';

describe('TempoControlComponent', () => {
  let fixture: ComponentFixture<TempoControlComponent>;
  let component: TempoControlComponent;
  let emitted: number[];
  let number: HTMLInputElement;
  let range: HTMLInputElement;

  const type = (value: string) => {
    number.value = value;
    number.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const commit = () => {
    number.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    localStorage.removeItem('tempo-control-metronome');
    localStorage.removeItem('tempo-control-count-in');
    await TestBed.configureTestingModule({ imports: [TempoControlComponent] }).compileComponents();
    fixture = TestBed.createComponent(TempoControlComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('tempo', 104);
    emitted = [];
    component.tempoChange.subscribe(value => emitted.push(value));
    fixture.detectChanges();
    number = fixture.nativeElement.querySelector('input[type="number"]');
    range = fixture.nativeElement.querySelector('input[type="range"]');
  });

  it('shows the current tempo in both inputs', () => {
    expect(number.value).toBe('104');
    expect(range.value).toBe('104');
  });

  it('applies in-range values while typing', () => {
    type('150');
    expect(component.tempo).toBe(150);
    expect(emitted).toEqual([150]);
    expect(range.value).toBe('150');
  });

  it('does not jump to the minimum while a number is being typed', () => {
    type('1'); // on the way to "120"
    expect(component.tempo).toBe(104);
    type('12');
    expect(component.tempo).toBe(104);
    type('120');
    expect(component.tempo).toBe(120);
    expect(emitted).toEqual([120]);
  });

  it('clamps out-of-range values on commit and shows the applied value', () => {
    type('999');
    commit();
    expect(component.tempo).toBe(200);
    expect(number.value).toBe('200');
    expect(range.value).toBe('200');

    type('1');
    commit();
    expect(component.tempo).toBe(20);
    expect(number.value).toBe('20');
  });

  it('rewrites the field even when the clamped value equals the current tempo (stale display bug)', () => {
    type('999');
    commit();
    expect(number.value).toBe('200');

    type('9999'); // clamps to 200 again: the tempo does not change
    commit();
    expect(component.tempo).toBe(200);
    expect(number.value).toBe('200');
    expect(emitted).toEqual([200]);
  });

  it('restores the field when the input is emptied', () => {
    type('');
    commit();
    expect(component.tempo).toBe(104);
    expect(number.value).toBe('104');
  });

  it('+ and - buttons step by one within the limits', () => {
    const [minus, plus] = fixture.nativeElement.querySelectorAll('button');
    plus.click();
    expect(component.tempo).toBe(105);
    minus.click();
    minus.click();
    expect(component.tempo).toBe(103);

    component.setTempo(200);
    plus.click();
    expect(component.tempo).toBe(200);
  });

  it('the range slider sets the tempo', () => {
    range.value = '60';
    range.dispatchEvent(new Event('input'));
    expect(component.tempo).toBe(60);
  });

  it('close emits closeModal', () => {
    const closed = vi.fn();
    component.closeModal.subscribe(closed);
    const close = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Close')!;
    close.click();
    expect(closed).toHaveBeenCalledOnce();
  });

  describe('count-in', () => {
    const countIn = () => fixture.nativeElement.querySelector('[data-count-in]') as HTMLInputElement;
    const set = (value: string) => {
      countIn().value = value;
      countIn().dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    it('is 2 bars unless chosen otherwise', () => {
      expect(countIn().value).toBe('2');
    });

    it('is chosen in whole bars from 0 to 4, kept for the next visits', () => {
      const bars: number[] = [];
      component.countInChange.subscribe((value) => bars.push(value));
      set('0');
      set('9');
      set('2.6');
      expect(bars).toEqual([0, 4, 3]);
      expect(countIn().value).toBe('3');
      expect(localStorage.getItem('tempo-control-count-in')).toBe('3');
      set('');
      expect(countIn().value).toBe('3'); // an emptied field shows the count-in again
    });
  });
});
