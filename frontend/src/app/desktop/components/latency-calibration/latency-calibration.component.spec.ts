import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlayerAudioService } from '../../service/player-audio.service';
import { LatencyCalibrationComponent } from './latency-calibration.component';

describe('LatencyCalibrationComponent', () => {
  let audio: { latencyCalibrationMs: ReturnType<typeof signal<number>>; calibrateLatency: ReturnType<typeof vi.fn>; setLatencyCalibration: ReturnType<typeof vi.fn> };
  let el: HTMLElement;
  let render: () => void;
  let finish: (ms: number | null) => void;

  beforeEach(() => {
    audio = {
      latencyCalibrationMs: signal(0),
      calibrateLatency: vi.fn((signal: AbortSignal) => new Promise((resolve, reject) => {
        finish = resolve;
        signal.addEventListener('abort', () => reject(new Error('cancelled')));
      })),
      setLatencyCalibration: vi.fn((ms: number) => audio.latencyCalibrationMs.set(ms)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: PlayerAudioService, useValue: audio }] });
    const fixture = TestBed.createComponent(LatencyCalibrationComponent);
    el = fixture.nativeElement;
    render = () => fixture.detectChanges();
    render();
  });
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); render(); };
  const button = (attr: string) => el.querySelector(`[${attr}]`) as HTMLButtonElement;

  it('shows the correction, listens while calibrating, then shows the new one', async () => {
    expect(el.querySelector('[data-calibration-value]')?.textContent).toContain('0 ms');
    expect(button('data-calibration-reset')).toBeNull();
    button('data-calibrate').click();
    render();
    expect(el.querySelector('[data-calibration-listening]')).not.toBeNull();
    audio.latencyCalibrationMs.set(85);
    finish(85);
    await settle();
    expect(el.querySelector('[data-calibration-value]')?.textContent).toContain('85 ms');
  });

  it('says so when there were not enough taps on the beat', async () => {
    button('data-calibrate').click();
    finish(null);
    await settle();
    expect(el.querySelector('[data-calibration-failed]')).not.toBeNull();
  });

  it('can be cancelled, and reset to no correction', async () => {
    button('data-calibrate').click();
    render();
    (el.querySelector('[data-calibration-listening] + button') as HTMLButtonElement).click();
    await settle();
    expect(el.querySelector('[data-calibration-listening]')).toBeNull();
    audio.latencyCalibrationMs.set(60);
    render();
    button('data-calibration-reset').click();
    render();
    expect(audio.setLatencyCalibration).toHaveBeenCalledWith(0);
    expect(button('data-calibration-reset')).toBeNull();
  });
});
