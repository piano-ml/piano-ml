import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MicrophoneService } from '../../service/microphone.service';
import { PlayerAudioService } from '../../service/player-audio.service';
import { CALIBRATION_MODE_KEY, LatencyCalibrationComponent } from './latency-calibration.component';

describe('LatencyCalibrationComponent', () => {
  let audio: { latencyCalibrationMs: ReturnType<typeof signal<number>>; calibrateLatency: ReturnType<typeof vi.fn>; setLatencyCalibration: ReturnType<typeof vi.fn> };
  let microphone: {
    deviceId: ReturnType<typeof signal<string>>; isSupported: () => boolean; listDevices: ReturnType<typeof vi.fn>;
    requestPermission: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>;
  };
  let devices: { deviceId: string; label: string }[];
  let fixture: ComponentFixture<LatencyCalibrationComponent>;
  let el: HTMLElement;
  let finish: (ms: number | null) => void;

  const render = () => fixture.detectChanges();
  /** Lets pending promises settle (the device list, a calibration) and renders, twice: one can start another. */
  const settle = async () => {
    for (let i = 0; i < 2; i++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      render();
    }
  };
  const button = (attr: string) => el.querySelector(`[${attr}]`) as HTMLButtonElement;
  const options = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent?.trim());
  const radio = (mode: string) => el.querySelector(`[data-calibration-mode="${mode}"]`) as HTMLInputElement;

  function create(microphoneSupported = true) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerAudioService, useValue: audio },
        { provide: MicrophoneService, useValue: { ...microphone, isSupported: () => microphoneSupported } },
      ],
    });
    fixture = TestBed.createComponent(LatencyCalibrationComponent);
    el = fixture.nativeElement;
    render();
  }

  async function open() {
    fixture.componentRef.setInput('isOpen', true);
    await settle();
  }

  beforeEach(() => {
    localStorage.removeItem(CALIBRATION_MODE_KEY);
    audio = {
      latencyCalibrationMs: signal(0),
      calibrateLatency: vi.fn((signal: AbortSignal) => new Promise((resolve, reject) => {
        finish = resolve;
        signal.addEventListener('abort', () => reject(new Error('cancelled')));
      })),
      setLatencyCalibration: vi.fn((ms: number) => audio.latencyCalibrationMs.set(ms)),
    };
    devices = [];
    microphone = {
      deviceId: signal(''),
      isSupported: () => true,
      listDevices: vi.fn(async () => devices),
      requestPermission: vi.fn(async () => undefined),
      select: vi.fn((id: string) => microphone.deviceId.set(id)),
    };
  });
  afterEach(() => localStorage.removeItem(CALIBRATION_MODE_KEY));

  it('renders nothing while closed', () => {
    create();
    expect(el.textContent?.trim()).toBe('');
  });

  it('explains what to do each time it opens, a calibration made or not', async () => {
    for (const stored of [null, '70']) {
      if (stored === null) localStorage.removeItem('audioLatencyCalibrationMs');
      else localStorage.setItem('audioLatencyCalibrationMs', stored);
      TestBed.resetTestingModule();
      create();
      await open();
      const intro = el.querySelector('[data-calibration-intro]');
      expect(intro?.textContent).toContain('Let\'s tune the timing first');
      expect(intro?.textContent).toContain('not headphones');
      expect(intro?.textContent).toContain('Keep the room quiet');
      expect(intro?.textContent).toContain('MIDI keyboard taps');
    }
    localStorage.removeItem('audioLatencyCalibrationMs');
  });

  it('calibrates with the microphone hearing the speakers by default', async () => {
    create();
    await open();
    expect(radio('loopback').checked).toBe(true);
    expect(el.querySelector('[data-calibration-hint]')?.textContent).toContain('speakers');
    expect(el.querySelector('[data-microphone-select]')).not.toBeNull();
    button('data-calibrate').click();
    render();
    expect(audio.calibrateLatency).toHaveBeenLastCalledWith(expect.any(AbortSignal), 'loopback', expect.any(Function));
    expect(el.querySelector('[data-calibration-listening]')?.textContent).toContain('Listening to the clicks');
    finish(null);
    await settle();
    expect(el.querySelector('[data-calibration-failed]')?.textContent).toContain('did not hear the clicks');
  });

  it('falls back to MIDI taps, remembered, without the microphone choice', async () => {
    create();
    await open();
    radio('midi').click();
    render();
    expect(localStorage.getItem(CALIBRATION_MODE_KEY)).toBe('midi');
    expect(el.querySelector('[data-microphone-select]')).toBeNull();
    button('data-calibrate').click();
    expect(audio.calibrateLatency).toHaveBeenLastCalledWith(expect.any(AbortSignal), 'midi', expect.any(Function));
    finish(null);
    await settle();
    expect(el.querySelector('[data-calibration-failed]')?.textContent).toContain('Not enough taps');
  });

  it('offers only MIDI taps when the browser cannot capture audio', async () => {
    create(false);
    await open();
    expect(radio('midi').checked).toBe(true);
    expect(radio('loopback').disabled).toBe(true);
  });

  it('shows the correction, listens while calibrating, then shows the new one', async () => {
    create();
    await open();
    const value = () => (el.querySelector('[data-calibration-value]') as HTMLInputElement).value;
    expect(value()).toBe('0');
    expect(button('data-calibration-reset')).toBeNull();
    button('data-calibrate').click();
    render();
    expect(el.querySelector('[data-calibration-listening]')).not.toBeNull();
    audio.latencyCalibrationMs.set(85);
    finish(85);
    await settle();
    expect(value()).toBe('85');
  });

  it('shows the delay of each tap as it comes, faded when it does not count', async () => {
    create();
    await open();
    button('data-calibrate').click();
    render();
    const onTap = audio.calibrateLatency.mock.calls[0][2] as (tap: { click: number; ms: number; measured: boolean }) => void;
    onTap({ click: 0, ms: -30, measured: false });
    onTap({ click: 4, ms: 72, measured: true });
    render();
    const taps = [...el.querySelectorAll('[data-calibration-tap]')] as HTMLElement[];
    expect(taps.map((t) => t.textContent?.trim())).toEqual(['1: -30', '5: +72']);
    expect(taps.map((t) => t.classList.contains('opacity-40'))).toEqual([true, false]);
    finish(72);
    await settle();
    expect(el.querySelectorAll('[data-calibration-tap]')).toHaveLength(2); // kept with the result
  });

  it('takes a correction typed in, rounded and kept within the limits', async () => {
    create();
    await open();
    const input = el.querySelector('[data-calibration-value]') as HTMLInputElement;
    const type = (text: string) => { input.value = text; input.dispatchEvent(new Event('change')); render(); };
    type('72.6');
    expect(audio.setLatencyCalibration).toHaveBeenLastCalledWith(73);
    type('-900');
    expect(audio.setLatencyCalibration).toHaveBeenLastCalledWith(-400);
    expect(input.value).toBe('-400');
    audio.setLatencyCalibration.mockClear();
    type('');
    expect(audio.setLatencyCalibration).not.toHaveBeenCalled();
    expect(input.value).toBe('-400');
  });

  it('says so when the microphone cannot be opened', async () => {
    create();
    await open();
    audio.calibrateLatency.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    button('data-calibrate').click();
    await settle();
    expect(el.querySelector('[data-calibration-mic-error]')).not.toBeNull();
  });

  it('can be cancelled, and reset to no correction', async () => {
    create();
    await open();
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

  it('closes with its Close button or a backdrop click, cancelling a calibration under way', async () => {
    create();
    await open();
    let closed = 0;
    fixture.componentInstance.closeModal.subscribe(() => closed++);
    button('data-calibrate').click();
    render();
    const signal = audio.calibrateLatency.mock.calls[0][0] as AbortSignal;
    (el.querySelector('.modal-content') as HTMLElement).click();
    expect(closed).toBe(0);
    button('data-calibration-close').click();
    expect(signal.aborted).toBe(true);
    (el.querySelector('.modal') as HTMLElement).click();
    expect(closed).toBe(2);
  });

  describe('microphone choice', () => {
    const micSelect = () => el.querySelector('[data-microphone-select]') as HTMLSelectElement;

    it('asks for the microphone before the devices can be named, then lists them', async () => {
      devices = [{ deviceId: 'm-1', label: '' }];
      create();
      await open();
      expect(options(micSelect())).toEqual(['Default microphone', 'Microphone 1']);
      microphone.requestPermission.mockImplementation(async () => { devices = [{ deviceId: 'm-1', label: 'USB Mic' }]; });
      button('data-microphone-allow').click();
      await settle();
      expect(options(micSelect())).toEqual(['Default microphone', 'USB Mic']);
      expect(button('data-microphone-allow')).toBeNull();
    });

    it('keeps the microphone chosen', async () => {
      devices = [{ deviceId: 'm-1', label: 'USB Mic' }];
      create();
      await open();
      micSelect().value = 'm-1';
      micSelect().dispatchEvent(new Event('change'));
      expect(microphone.select).toHaveBeenCalledWith('m-1');
    });

    it('says so when the microphone is refused', async () => {
      create();
      await open();
      microphone.requestPermission.mockRejectedValue(new DOMException('no', 'NotAllowedError'));
      button('data-microphone-allow').click();
      await settle();
      expect(el.querySelector('[data-microphone-denied]')).not.toBeNull();
    });
  });
});
