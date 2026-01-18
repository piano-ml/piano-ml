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

@Component({
  selector: 'app-scales',
  imports: [CommonModule, FormsModule],
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

  private isHydratingFromUrl = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private titleService: Title
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const scaleKey = params.get('scaleKey');
      const selectedKey = params.get('selectedKey');
      const exerciseKey = params.get('exerciseKey');

      if (!scaleKey || !selectedKey || !exerciseKey) {
        // If the user lands on `/exercises/scale` without params, reflect the
        // current default state in the URL.
        this.syncKeysForScale();
        this.updateUrlFromState();
        this.updatePageTitle();
        return;
      }

      this.isHydratingFromUrl = true;

      const foundScale = this.scales.find((s) => this.normalizeKey(s.key ?? s.name) === this.normalizeKey(scaleKey));
      if (foundScale) {
        this.selectedScale = foundScale;
      }

      this.syncKeysForScale();

      if (this.keys.includes(selectedKey)) {
        this.selectedKey = selectedKey;
      }

      const foundExercise = this.myexcerices.find(
        (e) => this.normalizeKey(e.key ?? e.title) === this.normalizeKey(exerciseKey)
      );
      if (foundExercise) {
        this.selectedExcercice = foundExercise;
      }

      this.isHydratingFromUrl = false;

      this.updatePageTitle();
    });
  }

  load() {
    loadExercice(this.router, this.selectedExcercice, this.selectedScale, this.selectedKey)
  }

  onScaleChange() {
    this.syncKeysForScale(true);
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onExerciseChange() {
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  onKeyChange() {
    this.updateUrlFromState();
    this.updatePageTitle();
  }

  private updatePageTitle() {
    const scaleName = this.selectedScale?.name;
    const exerciseName = this.selectedExcercice?.title;
    const selectedKey = this.selectedKey;

    if (scaleName && selectedKey && exerciseName) {
      this.titleService.setTitle(`Scale of ${selectedKey} ${scaleName} - ${exerciseName}`);
      return;
    }

    if (scaleName && selectedKey) {
      this.titleService.setTitle(`${selectedKey} ${scaleName}`);
      return;
    }

    this.titleService.setTitle('PianoML');
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

    const scaleKey = this.normalizeKey(this.selectedScale.key ?? this.selectedScale.name);
    const exerciseKey = this.normalizeKey(this.selectedExcercice.key ?? this.selectedExcercice.title);

    // Only update the URL if we have enough state to build it.
    if (!scaleKey || !this.selectedKey || !exerciseKey) {
      return;
    }

    this.router.navigate(['/', 'exercises', 'scale', scaleKey, this.selectedKey, exerciseKey], {
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

}
