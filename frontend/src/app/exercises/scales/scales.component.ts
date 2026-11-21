import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { prefetchSoundFont } from '../../shared/services/soundfont-cache';
import { majorKeys, minorKeys, Scale, scales } from '../../desktop/service/music-theory';
import { exercises } from './pattern';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, Router } from '@angular/router';
import { getWeekOfYear, loadExercice } from '../exercices';
import type { Exercise } from '../model';

import { FormsModule } from '@angular/forms';
import { SeoService } from '../../shared/seo';
import { buildScalesSeo } from './scales.seo';
import { NoteNamePipe } from '../../shared/i18n';
import { PopularScoresInKeyComponent } from '../../shared/components/popular-scores-in-key/popular-scores-in-key.component';

@Component({
  selector: 'app-scales',
  imports: [FormsModule, PopularScoresInKeyComponent, NoteNamePipe],
  templateUrl: './scales.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
      } else if (!this.keys.includes(this.selectedKey)) {
        this.selectedKey = this.keys[getWeekOfYear() % this.keys.length];
      }

      const foundExercise = this.myexcerices.find(
        (e) => e.key === exerciseKey
      );
      if (foundExercise) {
        this.selectedExcercice = foundExercise;
      }

      this.isHydratingFromUrl = false;

      // A URL naming a scale, key or exercise the page doesn't offer shows the fallback: say so in the URL
      // instead of keeping one that doesn't match the page.
      if (!foundScale || !matchingKey || !foundExercise) {
        this.updateUrlFromState();
      }

      this.updateFullKey();
      this.updatePageTitle();
    });
  }

  /** The workbench's sounds start downloading as the user points at the button that opens it. */
  protected readonly prefetchSounds = prefetchSoundFont;

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
    this.seo.update(buildScalesSeo({
      scaleName: this.selectedScale?.name,
      scaleKey: this.selectedScale?.key ?? this.selectedScale?.name?.toLowerCase(),
      exerciseName: this.selectedExcercice?.title,
      exerciseKey: this.selectedExcercice?.key,
      selectedKey: this.selectedKey
    }));
  }

  /** Minor-family scales (natural, harmonic, melodic minor, minor pentatonic and blues…) use minor keys. */
  private isMinorScale(): boolean {
    return (this.selectedScale.key ?? '').includes('minor');
  }

  private syncKeysForScale(resetSelectedKey = false) {
    this.keys = this.isMinorScale() ? minorKeys : majorKeys;

    // Keep the key when it is still offered (e.g. minor → harmonic minor), otherwise the key of the week.
    if (resetSelectedKey && !this.keys.includes(this.selectedKey)) {
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
    return `/library/popular?fullKey=${encodeURIComponent(this.fullKey)}`;
  }

  private updateFullKey(): void {
    // From the stable key, not the translated name: "harmonic_minor", "minor_pentatonic"… are minor.
    const isMinor = this.isMinorScale();
    const isMajor = this.selectedScale.key === 'major';
    
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
