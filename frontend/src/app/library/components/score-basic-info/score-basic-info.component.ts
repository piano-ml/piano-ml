import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScoreApiInfo } from '../../../core/api';

@Component({
  selector: 'app-score-basic-info',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './score-basic-info.component.html',
  styleUrl: './score-basic-info.component.css'
})
export class ScoreBasicInfoComponent {
  @Input() score!: ScoreApiInfo;
}
