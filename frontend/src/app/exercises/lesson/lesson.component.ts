import { Component } from '@angular/core';
import { exercises } from './pattern';
import { getWeekOfYear, loadExercice } from '../exercices';
import { Router } from '@angular/router';
import { Exercise, Melody } from '../model';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-lesson',
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './lesson.component.html',
  styleUrl: './lesson.component.css'
})
export class LessonComponent {
  myexcerices = exercises;
  selectedExcercice: Exercise = exercises[0]
  selectedChord: Melody = { kind: 'Melody', name: '', alt: '', pattern: [] };

  constructor(private router: Router) {

  }

  load() {
    loadExercice(this.router, this.selectedExcercice, this.selectedChord, 'C4')
  }

  onSelectedExerciceChange() {

  }

}
