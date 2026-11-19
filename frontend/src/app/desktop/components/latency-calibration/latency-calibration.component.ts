import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CALIBRATION_MAX_MS } from '../../service/latency-calibration';
import { MicrophoneService } from '../../service/microphone.service';
import { CalibrationMode, CalibrationTap, PlayerAudioService } from '../../service/player-audio.service';

/** Where the chosen calibration mode is kept between visits. */
export const CALIBRATION_MODE_KEY = 'latencyCalibrationMode';
const MODES: CalibrationMode[] = ['loopback', 'midi'];

/**
 * The timing calibration dialog (opened from the workbench setup): the app plays clicks and measures when they are
 * heard, which corrects how key presses are scored (useful with Bluetooth headphones, which browsers under-report).
 * By default the microphone hears the clicks from the speakers; without a microphone, the user taps a MIDI key on
 * each click. The correction can also be typed in.
 */
@Component({
  selector: 'app-latency-calibration',
  template: `
    @if (isOpen) {
    <div class="modal" (click)="onBackdropClick($event)">
      <div class="modal-content" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="latency-calibration-title">
        <div class="card-secondary-title ml-4 mb-2" id="latency-calibration-title" i18n="@@latency.heading">Timing calibration</div>

        <section class="card-secondary mb-2 text-sm" data-calibration-intro>
          <div class="font-medium mb-1" i18n="@@latency.intro.title">Let's tune the timing first</div>
          <p class="mb-2" i18n="@@latency.intro.why">So that your playing is scored against what you actually hear, Piano ML measures the delay of your speakers. It takes about 20 seconds.</p>
          <ol class="list-decimal ml-5 mb-2 flex flex-col gap-1">
            <li i18n="@@latency.intro.speakers">Play the sound through your speakers, not headphones, with the volume up.</li>
            <li i18n="@@latency.intro.quiet">Keep the room quiet while the clicks play.</li>
            <li i18n="@@latency.intro.start">Press Calibrate and allow the microphone if your browser asks.</li>
          </ol>
          <p class="text-xs text-neutral-300" i18n="@@latency.intro.fallback">No microphone, or using headphones? Choose MIDI keyboard taps instead.</p>
        </section>

        <section class="card-secondary mb-2 flex flex-col gap-2 text-sm" data-calibration-modes>
          <label class="flex items-center gap-2" [class.opacity-50]="!microphoneSupported">
            <input type="radio" name="calibration-mode" value="loopback" [checked]="mode() === 'loopback'"
              [disabled]="!microphoneSupported || state() === 'listening'" (change)="setMode('loopback')" data-calibration-mode="loopback">
            <span i18n="@@latency.mode.loopback">Microphone hears the speakers</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="radio" name="calibration-mode" value="midi" [checked]="mode() === 'midi'"
              [disabled]="state() === 'listening'" (change)="setMode('midi')" data-calibration-mode="midi">
            <span i18n="@@latency.mode.midi">MIDI keyboard taps</span>
          </label>
          <div class="text-xs text-neutral-300" data-calibration-hint>
            @if (mode() === 'loopback') {
              <ng-container i18n="@@latency.hint.loopback">Play through the speakers, volume up, and stay quiet: the microphone hears the clicks and measures the delay of your speakers.</ng-container>
            } @else {
              <ng-container i18n="@@latency.hint">Tap a key of your MIDI keyboard on each click, so that your playing is scored against what you hear (useful with Bluetooth headphones).</ng-container>
            }
          </div>
        </section>

        @if (mode() === 'loopback') {
        <section class="card-secondary mb-2 grid grid-cols-3 gap-2 text-sm">
          <div i18n="@@midiSetup.microphone">Microphone</div>
          <div class="col-span-2 flex flex-wrap items-center justify-end gap-2">
            @if (microphoneDenied()) {
            <div class="text-red-300" data-microphone-denied i18n="@@midiSetup.microphone.denied">Microphone access was refused. Allow it in the browser's site settings.</div>
            }
            @if (!microphoneNamesKnown()) {
            <button type="button" class="btn-secondary" (click)="allowMicrophone()" data-microphone-allow i18n="@@midiSetup.microphone.allow">Allow the microphone</button>
            }
            <select class="w-full input-field" (change)="selectMicrophone($any($event.target).value)" [disabled]="state() === 'listening'" data-microphone-select>
              <option value="" [selected]="!microphone.deviceId()" i18n="@@midiSetup.microphone.default">Default microphone</option>
              @for (device of microphones(); track device.deviceId; let i = $index) {
              <option [value]="device.deviceId" [selected]="microphone.deviceId() === device.deviceId">
                {{ device.label || microphoneLabel + ' ' + (i + 1) }}
              </option>
              }
            </select>
          </div>
        </section>
        }

        <section class="card-secondary mb-2 flex flex-wrap items-center justify-end gap-2 text-sm" aria-live="polite">
          @switch (state()) {
            @case ('listening') {
              <span data-calibration-listening>
                @if (mode() === 'loopback') {
                  <ng-container i18n="@@latency.listening.loopback">Listening to the clicks…</ng-container>
                } @else {
                  <ng-container i18n="@@latency.listening">Tap along with the clicks…</ng-container>
                }
              </span>
              <button type="button" class="btn-secondary" (click)="cancel()" i18n="@@latency.cancel">Cancel</button>
            }
            @default {
              @if (state() === 'failed') {
                <span class="text-red-300" data-calibration-failed>
                  @if (mode() === 'loopback') {
                    <ng-container i18n="@@latency.failed.loopback">The microphone did not hear the clicks. Turn the volume up and try again.</ng-container>
                  } @else {
                    <ng-container i18n="@@latency.failed">Not enough taps on the beat. Try again.</ng-container>
                  }
                </span>
              }
              @if (state() === 'mic-error') {
                <span class="text-red-300" data-calibration-mic-error i18n="@@latency.micError">The microphone could not be opened. Allow it for this site and check the microphone chosen above.</span>
              }
              <label class="flex items-center gap-2">
                <span i18n="@@latency.manual">Correction (ms)</span>
                <input type="number" class="input-field w-24" step="1" [min]="-maxMs" [max]="maxMs"
                  [value]="audio.latencyCalibrationMs()" (change)="setManually($event)" data-calibration-value>
              </label>
              <button type="button" class="btn-primary" (click)="calibrate()" data-calibrate i18n="@@latency.calibrate">Calibrate</button>
              @if (audio.latencyCalibrationMs() !== 0) {
                <button type="button" class="btn-secondary" (click)="reset()" data-calibration-reset i18n="@@latency.reset">Reset</button>
              }
            }
          }
        </section>

        @if (taps().length > 0) {
        <section class="card-secondary mb-2 text-sm" data-calibration-taps>
          <div class="text-xs text-neutral-300 mb-1" i18n="@@latency.taps">Delay after each click, in ms (faded: not counted)</div>
          <div class="flex flex-wrap gap-1">
            @for (tap of taps(); track $index) {
            <span class="px-2 py-0.5 rounded bg-neutral-700 tabular-nums" [class.opacity-40]="!tap.measured" data-calibration-tap>{{ tap.click + 1 }}: {{ tap.ms > 0 ? '+' : '' }}{{ tap.ms }}</span>
            }
          </div>
        </section>
        }

        <div class="flex justify-end">
          <button type="button" (click)="close()" class="btn-secondary" data-calibration-close i18n="@@common.close">Close</button>
        </div>
      </div>
    </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LatencyCalibrationComponent implements OnChanges, OnDestroy {
  protected readonly audio = inject(PlayerAudioService);
  protected readonly microphone = inject(MicrophoneService);
  protected readonly microphoneSupported = this.microphone.isSupported();
  protected readonly microphoneLabel = $localize`:@@midiSetup.microphoneFallback:Microphone`;
  protected readonly maxMs = CALIBRATION_MAX_MS;

  @Input() isOpen = false;
  @Output() closeModal = new EventEmitter<void>();

  readonly state = signal<'idle' | 'listening' | 'failed' | 'mic-error'>('idle');
  readonly mode = signal<CalibrationMode>(this.readMode());
  /** Audio inputs. Their names stay empty until the user allowed the microphone once. */
  readonly microphones = signal<MediaDeviceInfo[]>([]);
  readonly microphoneNamesKnown = signal(false);
  readonly microphoneDenied = signal(false);
  /** Each tap (or sound heard) of the last calibration, as it came. */
  readonly taps = signal<CalibrationTap[]>([]);
  private abort?: AbortController;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.state.set('idle');
      this.loadMicrophones();
    } else if (changes['isOpen'] && !changes['isOpen'].firstChange) {
      this.cancel();
    }
  }

  async calibrate(): Promise<void> {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.state.set('listening');
    this.taps.set([]);
    try {
      const ms = await this.audio.calibrateLatency(signal, this.mode(), (tap) => this.taps.update((taps) => [...taps, tap]));
      this.state.set(ms === null ? 'failed' : 'idle');
    } catch (error) {
      // cancelled, the sounds could not load, or the microphone could not be opened
      this.state.set(!signal.aborted && this.mode() === 'loopback' && isMicrophoneError(error) ? 'mic-error' : 'idle');
    }
    if (this.mode() === 'loopback' && !this.microphoneNamesKnown()) {
      this.loadMicrophones(); // the calibration asked for the microphone: the names are known now
    }
  }

  cancel(): void {
    this.abort?.abort();
  }

  close(): void {
    this.cancel();
    this.closeModal.emit();
  }

  onBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  setMode(mode: string): void {
    if (!MODES.includes(mode as CalibrationMode) || (mode === 'loopback' && !this.microphoneSupported)) return;
    this.mode.set(mode as CalibrationMode);
    this.state.set('idle');
    this.taps.set([]);
    try {
      localStorage.setItem(CALIBRATION_MODE_KEY, mode);
    } catch {
      // storage unavailable: the choice lasts for this visit
    }
  }

  selectMicrophone(deviceId: string): void {
    this.microphone.select(deviceId);
  }

  /** The browser prompt, then the devices again, with their names this time. */
  async allowMicrophone(): Promise<void> {
    try {
      await this.microphone.requestPermission();
      this.microphoneDenied.set(false);
    } catch {
      this.microphoneDenied.set(true);
    }
    await this.loadMicrophones();
  }

  /** A correction typed in: whole milliseconds within ±CALIBRATION_MAX_MS; an empty or invalid entry changes nothing. */
  setManually(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(value)) {
      input.value = String(this.audio.latencyCalibrationMs());
      return;
    }
    const ms = Math.max(-CALIBRATION_MAX_MS, Math.min(CALIBRATION_MAX_MS, Math.round(value)));
    input.value = String(ms);
    this.audio.setLatencyCalibration(ms);
    this.state.set('idle');
  }

  reset(): void {
    this.audio.setLatencyCalibration(0);
    this.state.set('idle');
  }

  ngOnDestroy(): void {
    this.cancel();
  }

  private async loadMicrophones(): Promise<void> {
    if (!this.microphoneSupported) return;
    try {
      const devices = await this.microphone.listDevices();
      this.microphones.set(devices);
      this.microphoneNamesKnown.set(devices.some((device) => !!device.label));
    } catch {
      this.microphones.set([]);
    }
  }

  /** The microphone by default; MIDI taps when chosen before, or when this browser cannot capture audio. */
  private readMode(): CalibrationMode {
    if (!this.microphoneSupported) return 'midi';
    try {
      return localStorage.getItem(CALIBRATION_MODE_KEY) === 'midi' ? 'midi' : 'loopback';
    } catch {
      return 'loopback';
    }
  }
}

/** getUserMedia's failures: no permission, no device, the device busy or gone. */
function isMicrophoneError(error: unknown): boolean {
  return error instanceof DOMException
    && ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'SecurityError', 'AbortError'].includes(error.name);
}
