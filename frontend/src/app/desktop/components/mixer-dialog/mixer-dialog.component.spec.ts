import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AudioMixerService, MIXER_STORAGE_KEY } from '../../service/audio-mixer.service';
import { MixerDialogComponent } from './mixer-dialog.component';

describe('MixerDialogComponent', () => {
  let fixture: ComponentFixture<MixerDialogComponent>;
  let el: HTMLElement;

  async function open(hasAccompaniment: boolean) {
    await TestBed.configureTestingModule({ imports: [MixerDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(MixerDialogComponent);
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('hasAccompaniment', hasAccompaniment);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const channels = () => [...el.querySelectorAll('[data-mixer-channel]')].map((c) => c.getAttribute('data-mixer-channel'));
  const slider = (bus: string) => el.querySelector(`#mixer-${bus}`) as HTMLInputElement;
  const percent = (bus: string) => el.querySelector(`[data-mixer-channel="${bus}"] [data-mixer-percent]`)?.textContent?.trim();

  afterEach(() => localStorage.removeItem(MIXER_STORAGE_KEY));

  it('shows the score, the accompaniment and the metronome, at their default levels', async () => {
    await open(true);
    expect(channels()).toEqual(['score', 'accompaniment', 'metronome']);
    expect(percent('score')).toBe('30 %');
    expect(percent('accompaniment')).toBe('100 %');
    expect(percent('metronome')).toBe('30 %');
  });

  it('shows no accompaniment channel for a score without one', async () => {
    await open(false);
    expect(channels()).toEqual(['score', 'metronome']);
  });

  it('sets a level with its slider, kept for next time', async () => {
    await open(true);
    slider('score').value = '75';
    slider('score').dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(TestBed.inject(AudioMixerService).level('score')).toBe(0.75);
    expect(percent('score')).toBe('75 %');
    expect(JSON.parse(localStorage.getItem(MIXER_STORAGE_KEY)!).score).toBe(0.75);
  });

  it('resets the levels, and closes', async () => {
    await open(true);
    TestBed.inject(AudioMixerService).setLevel('metronome', 1);
    (el.querySelector('[data-mixer-reset]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(percent('metronome')).toBe('30 %');
    const closed = vi.fn();
    fixture.componentInstance.closeModal.subscribe(closed);
    (el.querySelector('.modal') as HTMLElement).click();
    expect(closed).toHaveBeenCalled();
  });
});
