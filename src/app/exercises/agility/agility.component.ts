import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { getNoteDurationTicks, getNoteDuration, keys, chords } from '../../desktop/service/music-theory';
import { Header, Track } from '@tonejs/midi';
import * as Midi from '@tonejs/midi';
import type { Chord, ChordInPattern, Exercise } from '../../exercises/model';
import { exercises } from './pattern';
// biome-ignore lint/style/useImportType: <explanation>
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { getWeekOfYear, loadExercice } from '../exercices';


@Component({
  selector: 'app-agility',
  imports: [CommonModule, FormsModule],
  templateUrl: './agility.component.html',
  styleUrl: './agility.component.css'
})
export class AgilityComponent implements OnInit {

  chords = chords;

  myexcerices = exercises;
  selectedExcercice: Exercise = exercises[0]
  selectedChord: Chord = chords[0]
  selectedKey = keys[getWeekOfYear() % keys.length]
  keys = keys
  availableChords = chords
  

  constructor(private router: Router) {

  }

  ngOnInit(): void {
    this.filterAvailableChords()
  }

  filterAvailableChords() {
    if (this.selectedExcercice.patternSize) {
      this.availableChords = chords.filter(chord => chord.pattern.length === this.selectedExcercice.patternSize)
    }
    this.selectedChord = this.availableChords[0]
  }

  onSelectedExerciceChange() {
    if (this.selectedExcercice.patternSize) {
      this.filterAvailableChords()
    }
  }

  load() {
    loadExercice(this.router, this.selectedExcercice, this.selectedChord, this.selectedKey)
  }

}
