import { Component } from '@angular/core';
import { majorKeys, minorKeys, Scale, scales } from '../../desktop/service/music-theory';
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
  selectedExcercice: Exercise = exercises[2]
  selectedScale: Scale = scales[0]
  selectedKey =  majorKeys[getWeekOfYear() % majorKeys.length]
  keys = majorKeys

  constructor(private router: Router) { }

  load() {
    loadExercice(this.router, this.selectedExcercice, this.selectedScale, this.selectedKey)
  }

  onScaleChange() {
    if (this.selectedScale.name === 'Minor') {
      this.keys = minorKeys;
      this.selectedKey = minorKeys[getWeekOfYear() % minorKeys.length];
    } else {
      this.keys = majorKeys;
      this.selectedKey = majorKeys[getWeekOfYear() % majorKeys.length];
    }
  }

}
