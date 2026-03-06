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
import { SeoService } from '../../shared/services/seo.service';
import { PopularScoresInKeyComponent } from '../../shared/components/popular-scores-in-key/popular-scores-in-key.component';


@Component({
  selector: 'app-agility',
  imports: [CommonModule, FormsModule, PopularScoresInKeyComponent],
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
    private titleService: Title,
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
    const chordName = this.selectedChord?.name;
    const exerciseName = this.selectedExcercice?.title;
    const selectedKey = this.selectedKey;
    const baseUrl = 'https://pianoml.org';

    let title: string;
    let description: string;
    let url: string;
    let keywords: string;
    let structuredData: any;

    if (chordName && selectedKey && exerciseName) {
      const exerciseKey = this.selectedExcercice.key;
      const chordKey = chordName.toLowerCase();
      
      title = `${exerciseName} - ${selectedKey} ${chordName}`;
      description = `Practice piano agility with ${selectedKey} ${chordName} chord in ${exerciseName}. Improve your piano technique with interactive exercises and real-time feedback.`;
      url = `${baseUrl}/exercises/agility/${selectedKey}/${chordKey}/${exerciseKey}`;
      keywords = `midi, piano, sight reading, ${exerciseName}`;
      
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'Course',
        'name': `${selectedKey} ${chordName} - ${exerciseName}`,
        'description': description,
        'educationalLevel': 'Beginner to Advanced',
        'teaches': `Piano agility using ${selectedKey} ${chordName} chord in ${exerciseName} pattern`,
        'provider': {
          '@type': 'Organization',
          'name': 'PianoML',
          'url': baseUrl
        }
      };
    } else if (chordName && selectedKey) {
      title = `${selectedKey} ${chordName} Chord | Piano Agility Exercises | PianoML`;
      description = `Learn and practice ${selectedKey} ${chordName} chord progressions with interactive piano agility exercises. Improve finger dexterity and chord transitions.`;
      url = `${baseUrl}/exercises/agility`;
      keywords = `piano agility, ${chordName} chord, ${selectedKey} key, piano exercises, chord practice, piano technique`;
      
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'Course',
        'name': `Piano Agility Exercises - ${selectedKey} ${chordName}`,
        'description': description,
        'educationalLevel': 'Beginner to Advanced',
        'provider': {
          '@type': 'Organization',
          'name': 'PianoML',
          'url': baseUrl
        }
      };
    } else {
      title = 'Piano Agility Exercises | PianoML - Improve Piano Technique & Finger Dexterity';
      description = 'Practice piano agility with interactive exercises. Develop finger dexterity, speed, and accuracy.';
      url = `${baseUrl}/exercises/agility`;
      keywords = 'circle of fifths, scales and arpeggios, arpeggio in root position two octaves, two octave arpeggios root 1st and 2nd inversions,  piano agility, piano exercises, finger dexterity, chord progressions, piano technique, piano practice';
      
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'Course',
        'name': 'Piano Agility Exercises',
        'description': description,
        'educationalLevel': 'Beginner to Advanced',
        'coursePrerequisites': 'Basic piano knowledge',
        'provider': {
          '@type': 'Organization',
          'name': 'PianoML',
          'url': baseUrl
        }
      };
    }

    this.seo.updateMetaTags({
      title,
      description,
      keywords,
      url,
      type: 'website',
      image: `${baseUrl}/assets/images/pianoml-og-image.jpg`,
      structuredData
    });
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
