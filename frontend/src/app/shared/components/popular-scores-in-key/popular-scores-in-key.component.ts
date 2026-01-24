import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScoreService } from '../../../core/api/api/score.service';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';

@Component({
  selector: 'app-popular-scores-in-key',
  imports: [CommonModule],
  templateUrl: './popular-scores-in-key.component.html',
  styleUrl: './popular-scores-in-key.component.css'
})
export class PopularScoresInKeyComponent implements OnChanges {
  @Input() fullKey!: string;
  @Input() limit = 10;

  popularScores: ScoreApiInfo[] = [];
  loadingScores = false;

  constructor(
    private scoreService: ScoreService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    //if (changes['fullKey']) {
      this.loadPopularScores();
    //}
  }

  loadPopularScores(): void {
    if (!this.fullKey) {
      return;
    }

    this.loadingScores = true;
  
    this.scoreService.scoreSearchGet(
      undefined, // keyword
      undefined, // ownerId
      undefined, // genreId
      undefined, // artist
      undefined, // artistSlug
      undefined, // genreSlug
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      undefined, // tempo
      this.fullKey, // fullKey
      undefined, // sortBy
      0, // offset
      this.limit // limit
    ).subscribe({
      next: (data) => {
        this.popularScores = data;
        this.loadingScores = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading popular scores:', error);
        this.loadingScores = false;
        this.popularScores = [];
        this.cdr.detectChanges();
      }
    });
  }

  getScoreUrl(score: ScoreApiInfo): string {
    const slug = score.immutableSlug || score.mutableSlug;
    return slug ? `/score/${slug}` : '#';
  }

  getLibraryUrl(): string {
    return `/library/popular?fullKey=${encodeURIComponent(this.fullKey)}`;
  }
}
