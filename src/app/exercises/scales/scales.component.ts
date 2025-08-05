import { Component } from '@angular/core';
import { keys, Scale, scales } from '../../desktop/service/music-theory';
import { exercises } from './pattern';
// biome-ignore lint/style/useImportType: <explanation>
import { Router } from '@angular/router';
import { getWeekOfYear, loadExercice } from '../exercices';
import type { Exercise } from '../model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-scales',
  imports: [CommonModule, FormsModule],
  templateUrl: './scales.component.html',
  styleUrl: './scales.component.css'
})
export class ScalesComponent {

  scales = scales;

  myexcerices = exercises;
  selectedExcercice: Exercise = exercises[0]
  selectedScale: Scale = scales[0]
  selectedKey = keys[getWeekOfYear() % keys.length]
  keys = keys

  constructor(private router: Router) { }

  load() {
    loadExercice(this.router, this.selectedExcercice, this.selectedScale, this.selectedKey)
  }

}
