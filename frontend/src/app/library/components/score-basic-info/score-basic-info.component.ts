import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ScoreApiInfo } from '../../../core/api';
import { KeyNamePipe } from '../../../shared/i18n';

@Component({
  selector: 'app-score-basic-info',
  standalone: true,
  imports: [CommonModule, RouterModule, KeyNamePipe],
  templateUrl: './score-basic-info.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './score-basic-info.component.css'
})
export class ScoreBasicInfoComponent {
  @Input() score!: ScoreApiInfo;



  formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return '—';
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${remaining.toString().padStart(2, '0')}`;
  }
}
