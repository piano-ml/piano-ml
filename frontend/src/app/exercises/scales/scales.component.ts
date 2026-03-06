import { Component, OnInit } from '@angular/core';
import { majorKeys, minorKeys, Scale, scales } from '../../desktop/service/music-theory';
import { exercises } from './pattern';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { getWeekOfYear, loadExercice } from '../exercices';
import type { Exercise } from '../model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeoService } from '../../shared/services/seo.service';
import { PopularScoresInKeyComponent } from '../../shared/components/popular-scores-in-key/popular-scores-in-key.component';

@Component({
  selector: 'app-scales',
  imports: [CommonModule, FormsModule, PopularScoresInKeyComponent],
  templateUrl: './scales.component.html',
  styleUrl: './scales.component.css'
})
export class ScalesComponent implements OnInit {

  scales = scales;

  myexcerices = exercises;
  selectedExcercice: Exercise = exercises[2]
  selectedScale: Scale = scales[0]
  selectedKey =  majorKeys[getWeekOfYear() % majorKeys.length]
  keys = majorKeys
  fullKey = '';
  componentKey = 0;

  private isHydratingFromUrl = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private titleService: Title,
    private seo: SeoService
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const selectedKey = params.get('selectedKey');
      const scaleKey = params.get('scaleKey');
      const exerciseKey = params.get('exerciseKey');

      if (!scaleKey || !selectedKey || !exerciseKey) {
        // If the user lands on `/exercises/scale` without params, reflect the
        // current default state in the URL.
        this.syncKeysForScale();
        this.updateFullKey();
        this.updateUrlFromState();
        this.updatePageTitle();
        return;
      }

      this.isHydratingFromUrl = true;

      const foundScale = this.scales.find((s) => (s.key ?? s.name.toLowerCase()) === scaleKey.toLowerCase());
      if (foundScale) {
        this.selectedScale = foundScale;
      }

      this.syncKeysForScale();

      // Check if selectedKey exists in keys (case-insensitive for minor keys)
      const matchingKey = this.keys.find(k => k.toLowerCase() === selectedKey.toLowerCase());
      if (matchingKey) {
        this.selectedKey = matchingKey;
      }

      const foundExercise = this.myexcerices.find(
        (e) => e.key === exerciseKey
      );
      if (foundExercise) {
        this.selectedExcercice = foundExercise;
      }

      this.isHydratingFromUrl = false;

      this.updateFullKey();
      this.updatePageTitle();
    });
  }

  load() {
    loadExercice(this.router, this.selectedExcercice, this.selectedScale, this.selectedKey)
  }

  onScaleChange() {
    this.syncKeysForScale(true);
    this.updateFullKey();
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onExerciseChange() {
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onKeyChange() {
    this.updateFullKey();
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  private updatePageTitle() {
    const baseUrl = 'https://pianoml.org';
    const scaleName = this.selectedScale?.name;
    const exerciseName = this.selectedExcercice?.title;
    const selectedKey = this.selectedKey;

    let title: string;
    let description: string;
    let url: string;
    let keywords: string;

    if (scaleName && selectedKey && exerciseName) {
      title = `${scaleName} Scale  of ${selectedKey} - ${exerciseName}`;
      description = `Practice ${selectedKey} ${scaleName} scale with ${exerciseName} exercise on PianoML. Interactive piano scale exercises with adjustable speed and hands-separated practice.`;
      const scaleKey = this.selectedScale.key ?? this.selectedScale.name.toLowerCase();
      const exerciseKey = this.selectedExcercice.key;
      url = `${baseUrl}/exercises/scale/${selectedKey}/${scaleKey}/${exerciseKey}`;
      keywords = `piano learning app, sight reading, ${selectedKey} ${scaleName} scale, ${exerciseName}, piano exercises, scale practice`;
    } else if (scaleName && selectedKey) {
      title = `${selectedKey} ${scaleName} Scale | PianoML Piano Exercises`;
      description = `Learn ${selectedKey} ${scaleName} scale on PianoML. Practice with interactive piano scale exercises, hands-separated practice, and adjustable tempo.`;
      const scaleKey = this.selectedScale.key ?? this.selectedScale.name.toLowerCase();
      url = `${baseUrl}/exercises/scale/${selectedKey}/${scaleKey}`;
      keywords = `piano learning app, sight reading, ${selectedKey} ${scaleName} scale, piano scales, scale exercises, piano practice, piano learning`;
    } else {
      title = 'Piano Scale Exercises | PianoML - Practice Major & Minor Scales';
      description = 'Practice piano scales on PianoML with interactive exercises. Contrary motion starting on the same note, Parallel motion in octaves, Left than Right Learn major and minor scales with hands-separated practice, adjustable speed, and various exercise patterns. Improve your piano technique.';
      url = `${baseUrl}/exercises/scale`;
      keywords = 'piano scales, piano learning app, sight reading, major scales, minor scales, Harmonic Minor, Melodic Minor, Jazz Minor Scale, Blues Heptatonic, Dorian Scale, Phrygian Dominant, piano exercises, scale practice, circle of fifths, piano technique, piano learning';
    }

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      'name': title,
      'description': description,
      'learningResourceType': 'Interactive Exercise',
      'educationalLevel': 'Beginner to Advanced',
      'about': {
        '@type': 'Thing',
        'name': 'Piano Scales',
        'description': 'Musical scales for piano practice and technique development'
      }
    };

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

  private syncKeysForScale(resetSelectedKey = false) {
    const isMinor = this.selectedScale.name === 'Minor';
    this.keys = isMinor ? minorKeys : majorKeys;

    if (resetSelectedKey) {
      this.selectedKey = this.keys[getWeekOfYear() % this.keys.length];
    }
  }

  private updateUrlFromState() {
    if (this.isHydratingFromUrl) {
      return;
    }

    const scaleKey = this.selectedScale.key ?? this.selectedScale.name.toLowerCase();
    const exerciseKey = this.selectedExcercice.key;

    // Only update the URL if we have enough state to build it.
    if (!scaleKey || !this.selectedKey || !exerciseKey) {
      return;
    }

    this.router.navigate(['/', 'exercises', 'scale', this.selectedKey, scaleKey, exerciseKey], {
      replaceUrl: true
    });
  }

  getLibraryUrl(): string {
    const fullKey = `${this.selectedKey} ${this.selectedScale.name}`;
    return `/library/popular?fullKey=${encodeURIComponent(fullKey)}`;
  }

  private updateFullKey(): void {
    const scaleName = this.selectedScale.name.toLowerCase();
    // Determine if it's major or minor scale (ignoring variations like "harmonic minor", "melodic minor", etc.)
    const isMinor = scaleName.includes('minor');
    const isMajor = scaleName === 'major';
    
    let note = this.selectedKey;
    
    // For minor keys, remove the 'm' suffix if present (e.g., "Am" -> "A")
    if (note.endsWith('m')) {
      note = note.slice(0, -1);
    }
    
    // Replace 'b' with '-' for flats (e.g., "Db" -> "D-", "Bb" -> "B-")
    note = note.replace(/b/g, '-');
    
    // Format: note is uppercase for Major, lowercase for Minor
    // e.g., "C# major", "c# minor", "B- major", "b- minor"
    const formattedNote = isMajor 
      ? note.charAt(0).toUpperCase() + note.slice(1)
      : note.charAt(0).toLowerCase() + note.slice(1);
    
    // Use simple "major" or "minor" for the fullKey, not the full scale name
    const simpleScaleName = isMinor ? 'minor' : 'major';
    
    this.fullKey = `${formattedNote} ${simpleScaleName}`;
    // Force component recreation by incrementing the key
    this.componentKey++;
  }

}
