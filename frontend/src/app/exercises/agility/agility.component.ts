import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { majorKeys, chords, Chord } from '../../desktop/service/music-theory';
import type {  Exercise } from '../../exercises/model';
import { exercises } from './pattern';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
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
  selectedKey = majorKeys[getWeekOfYear() % majorKeys.length]
  keys = majorKeys
  availableChords = chords

  private isHydratingFromUrl = false;
  

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private titleService: Title
  ) {

  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const selectedKey = params.get('selectedKey');
      const chordKey = params.get('chordKey');
      const exerciseKey = params.get('exerciseKey');

      if (!exerciseKey || !selectedKey || !chordKey) {
        // If the user lands on `/exercises/agility` without params, reflect the
        // current default state in the URL.
        this.filterAvailableChords();
        this.updateUrlFromState();
        this.updatePageTitle();
        return;
      }

      this.isHydratingFromUrl = true;

      const foundExercise = this.myexcerices.find(
        (e) => this.normalizeKey(e.key ?? e.title) === this.normalizeKey(exerciseKey)
      );
      if (foundExercise) {
        this.selectedExcercice = foundExercise;
      }

      if (this.keys.includes(selectedKey)) {
        this.selectedKey = selectedKey;
      }

      this.filterAvailableChords();

      const foundChord = this.availableChords.find(
        (c) => this.normalizeKey(c.name) === this.normalizeKey(chordKey)
      );
      if (foundChord) {
        this.selectedChord = foundChord;
      }

      this.isHydratingFromUrl = false;

      this.updatePageTitle();
    });
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

    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onKeyChange() {
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onChordChange() {
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  load() {
    loadExercice(this.router, this.selectedExcercice, this.selectedChord, this.selectedKey)
  }

  private updateUrlFromState() {
    if (this.isHydratingFromUrl) {
      return;
    }

    const exerciseKey = this.normalizeKey(this.selectedExcercice.key ?? this.selectedExcercice.title);
    const chordKey = this.normalizeKey(this.selectedChord.name);

    if (!exerciseKey || !this.selectedKey || !chordKey) {
      return;
    }

    this.router.navigate(['/', 'exercises', 'agility', this.selectedKey, chordKey, exerciseKey], {
      replaceUrl: true
    });
  }

  private normalizeKey(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
  }

  private updatePageTitle() {
    const chordName = this.selectedChord?.name;
    const exerciseName = this.selectedExcercice?.title;
    const selectedKey = this.selectedKey;

    if (chordName && selectedKey && exerciseName) {
      this.titleService.setTitle(`Chord of ${selectedKey} ${chordName} - ${exerciseName}`);
      return;
    }

    if (chordName && selectedKey) {
      this.titleService.setTitle(`Chord of ${selectedKey} ${chordName}`);
      return;
    }

    this.titleService.setTitle('PianoML');
  }

}
