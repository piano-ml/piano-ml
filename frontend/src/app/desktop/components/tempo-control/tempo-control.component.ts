

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
  @Output() tempoChange = new EventEmitter<number>();
  @Output() closeModal = new EventEmitter<void>();

  constructor(private cdr: ChangeDetectorRef) {}

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
