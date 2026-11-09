
import { Component, OnInit } from '@angular/core';
import { majorKeys, chords, Chord } from '../../desktop/service/music-theory';
import type {  Exercise } from '../../exercises/model';
import { exercises } from './pattern';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { getWeekOfYear, loadExercice } from '../exercices';
import { SeoService } from '../../shared/seo';
import { buildAgilitySeo } from './agility.seo';
import { PopularScoresInKeyComponent } from '../../shared/components/popular-scores-in-key/popular-scores-in-key.component';


@Component({
  selector: 'app-agility',
  imports: [FormsModule, PopularScoresInKeyComponent],
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
  fullKey = '';
  componentKey = 0;

  private isHydratingFromUrl = false;
  

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private seo: SeoService
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
        this.updateFullKey();
        this.updateUrlFromState();
        this.updatePageTitle();
        return;
      }

      this.isHydratingFromUrl = true;

      const foundExercise = this.myexcerices.find(
        (e) => e.key === exerciseKey
      );
      if (foundExercise) {
        this.selectedExcercice = foundExercise;
      }

      if (this.keys.includes(selectedKey)) {
        this.selectedKey = selectedKey;
      }

      this.filterAvailableChords();

      const foundChord = this.availableChords.find(
        (c) => c.name.toLowerCase() === chordKey.toLowerCase()
      );
      if (foundChord) {
        this.selectedChord = foundChord;
      }

      this.isHydratingFromUrl = false;

      this.updateFullKey();
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

    this.updateFullKey();
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onKeyChange() {
    this.updateFullKey();
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onChordChange() {
    this.updateFullKey();
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

    const exerciseKey = this.selectedExcercice.key;
    const chordKey = this.selectedChord.name.toLowerCase();

    if (!exerciseKey || !this.selectedKey || !chordKey) {
      return;
    }

    this.router.navigate(['/', 'exercises', 'agility', this.selectedKey, chordKey, exerciseKey], {
      replaceUrl: true
    });
  }

  private updatePageTitle() {
    this.seo.update(buildAgilitySeo({
      chordName: this.selectedChord?.name,
      chordKey: this.selectedChord?.name?.toLowerCase(),
      exerciseName: this.selectedExcercice?.title,
      exerciseKey: this.selectedExcercice?.key,
      selectedKey: this.selectedKey
    }));
  }

  private updateFullKey(): void {
    let note = this.selectedKey;
    
    // Replace 'b' with '-' for flats (e.g., "Db" -> "D-", "Bb" -> "B-")
    note = note.replace(/b/g, '-');
    
    // Determine if the chord is minor based on the chord name property
    const isMinor = this.selectedChord.name === 'Minor';
    
    // Format: note is uppercase for Major, lowercase for Minor
    const formattedNote = isMinor
      ? note.charAt(0).toLowerCase() + note.slice(1)
      : note.charAt(0).toUpperCase() + note.slice(1);
    
    const scaleType = isMinor ? 'minor' : 'major';
    
    this.fullKey = `${formattedNote} ${scaleType}`;
    // Force component recreation by incrementing the key
    this.componentKey++;
    console.log('updateFullKey called (agility), selectedKey:', this.selectedKey, 'selectedChord:', this.selectedChord.name, 'fullKey:', this.fullKey, 'componentKey:', this.componentKey);
  }

}
