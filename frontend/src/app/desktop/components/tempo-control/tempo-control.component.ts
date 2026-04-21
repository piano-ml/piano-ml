

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-tempo-control',
  standalone: true,
  imports: [NgIcon],
  templateUrl: './tempo-control.component.html',
  styleUrl: './tempo-control.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TempoControlComponent {
  @Input() isOpen = false;
  @Input() tempo = 120;
  @Input() metronome = false;
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

  onBackdropClick(event: Event) {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close() {
    this.closeModal.emit();
  }

  setTempo(value: number) {
    const v = Math.round(Math.min(200, Math.max(20, value)));
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

  onNumberInput(val: string) {
    const n = Number(val);
    if (!isNaN(n)) this.setTempo(n);
  }

  onRangeInput(val: string) {
    const n = Number(val);
    if (!isNaN(n)) this.setTempo(n);
  }
}
