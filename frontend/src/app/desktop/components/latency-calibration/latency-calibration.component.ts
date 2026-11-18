import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { PlayerAudioService } from '../../service/player-audio.service';

/**
 * Tap-along timing calibration (in the workbench setup): the app plays clicks, the user taps a key of their MIDI
 * keyboard on each one, and the measured gap corrects how key presses are scored (useful with Bluetooth
 * headphones, which browsers under-report).
 */
@Component({
  selector: 'app-latency-calibration',
  template: `
    <div class="card-secondary grid grid-cols-3 gap-2">
      <div>
        <div class="font-medium" i18n="@@latency.heading">Timing calibration</div>
        <div class="text-xs text-neutral-300" i18n="@@latency.hint">Tap a key of your MIDI keyboard on each click, so that your playing is scored against what you hear (useful with Bluetooth headphones).</div>
      </div>
      <div class="col-span-2 flex flex-wrap items-center justify-end gap-2 text-sm" aria-live="polite">
        @switch (state()) {
          @case ('listening') {
            <span data-calibration-listening i18n="@@latency.listening">Tap along with the clicks…</span>
            <button type="button" class="btn-secondary" (click)="cancel()" i18n="@@latency.cancel">Cancel</button>
          }
          @default {
            @if (state() === 'failed') {
              <span class="text-red-300" data-calibration-failed i18n="@@latency.failed">Not enough taps on the beat. Try again.</span>
            }
            <span data-calibration-value i18n="@@latency.value">Correction: {{ audio.latencyCalibrationMs() }} ms</span>
            <button type="button" class="btn-primary" (click)="calibrate()" data-calibrate i18n="@@latency.calibrate">Calibrate</button>
            @if (audio.latencyCalibrationMs() !== 0) {
              <button type="button" class="btn-secondary" (click)="reset()" data-calibration-reset i18n="@@latency.reset">Reset</button>
            }
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LatencyCalibrationComponent implements OnDestroy {
  protected readonly audio = inject(PlayerAudioService);
  readonly state = signal<'idle' | 'listening' | 'failed'>('idle');
  private abort?: AbortController;

  async calibrate(): Promise<void> {
    this.abort = new AbortController();
    this.state.set('listening');
    try {
      const ms = await this.audio.calibrateLatency(this.abort.signal);
      this.state.set(ms === null ? 'failed' : 'idle');
    } catch {
      // cancelled, or the sounds could not load
      this.state.set('idle');
    }
  }

  cancel(): void {
    this.abort?.abort();
  }

  reset(): void {
    this.audio.setLatencyCalibration(0);
    this.state.set('idle');
  }

  ngOnDestroy(): void {
    this.cancel();
  }
}
