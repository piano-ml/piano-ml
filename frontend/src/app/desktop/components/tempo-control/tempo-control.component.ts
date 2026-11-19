

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { COUNT_IN_MAX_BARS, COUNT_IN_STORAGE_KEY, readCountInBars } from '../../service/player.service';

@Component({
  selector: 'app-tempo-control',
  standalone: true,
  imports: [NgIcon],
  templateUrl: './tempo-control.component.html',
  styleUrl: './tempo-control.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TempoControlComponent {
  static readonly MIN = 20;
  static readonly MAX = 200;

  @Input() isOpen = false;
  @Input() tempo = 120;
  @Input() metronome = false;
  /** Bars of clicks before playback starts (0: none). */
  @Input() countIn = readCountInBars();
  @Output() countInChange = new EventEmitter<number>();
  protected readonly countInMax = COUNT_IN_MAX_BARS;
  @Output() tempoChange = new EventEmitter<number>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() metronomeStatus = new EventEmitter<boolean>();

  private readonly metronomeStorageKey = 'tempo-control-metronome';

  constructor(private cdr: ChangeDetectorRef) {
    // Initialisation depuis le localStorage si disponible
    const stored = localStorage.getItem(this.metronomeStorageKey);
    if (stored !== null) {
      this.metronome = JSON.parse(stored);
    }
  }

  onMetronomeStatus(value: boolean) {
    this.metronome = value;
    localStorage.setItem(this.metronomeStorageKey, JSON.stringify(value));
    this.metronomeStatus.emit(value);
    this.cdr.markForCheck();
  }

  /** A count-in typed or stepped: whole bars from 0 to COUNT_IN_MAX_BARS, kept for the next visits. */
  onCountInChange(input: HTMLInputElement) {
    const n = Number(input.value);
    if (input.value !== '' && Number.isFinite(n)) {
      const bars = Math.round(Math.min(COUNT_IN_MAX_BARS, Math.max(0, n)));
      if (bars !== this.countIn) {
        this.countIn = bars;
        try {
          localStorage.setItem(COUNT_IN_STORAGE_KEY, String(bars));
        } catch {
          // storage unavailable: the choice lasts for this visit
        }
        this.countInChange.emit(bars);
      }
    }
    input.value = String(this.countIn);
    this.cdr.markForCheck();
  }

  onBackdropClick(event: Event) {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close() {
    this.closeModal.emit();
  }

  setTempo(value: number) {
    const v = Math.round(Math.min(TempoControlComponent.MAX, Math.max(TempoControlComponent.MIN, value)));
    if (v !== this.tempo) {
      this.tempo = v;
      this.tempoChange.emit(this.tempo);
      this.cdr.markForCheck();
    }
  }

  increase() {
    this.setTempo(this.tempo + 1);
  }

  decrease() {
    this.setTempo(this.tempo - 1);
  }

  /** While typing: apply only values inside the range, so "1" on the way to "120" does not jump to 20. */
  onNumberInput(val: string) {
    const n = Number(val);
    if (val !== '' && !isNaN(n) && n >= TempoControlComponent.MIN && n <= TempoControlComponent.MAX) {
      this.setTempo(n);
    }
  }

  /**
   * On commit (Enter / blur): clamp, then always rewrite the field. [value]="tempo" alone does not refresh the
   * field when the clamped tempo equals the current one (typing 9999 at 200 used to leave "9999" displayed).
   */
  onNumberCommit(input: HTMLInputElement) {
    const n = Number(input.value);
    if (input.value !== '' && !isNaN(n)) this.setTempo(n);
    input.value = String(this.tempo);
  }

  onRangeInput(val: string) {
    const n = Number(val);
    if (!isNaN(n)) this.setTempo(n);
  }
}
