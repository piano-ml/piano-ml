import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ScoreApiInfo } from '../../../core/api';

@Component({
  selector: 'app-score-basic-info',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './score-basic-info.component.html',
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
