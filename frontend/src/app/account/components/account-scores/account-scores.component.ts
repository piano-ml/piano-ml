import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';

import { RouterModule, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo } from '../../../core/api';
import { AuthService } from '../../services/auth.service';
import { ScoreTableComponent, ScoreTableAction, ScoreTableColumn, ScoreTableEvent } from '../../../shared/components/score-table/score-table.component';
import { QuickActionsComponent } from '../../../shared/components/quick-actions/quick-actions.component';

@Component({
  selector: 'app-account-scores',
  imports: [RouterModule, ScoreTableComponent, QuickActionsComponent],
  templateUrl: './account-scores.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './account-scores.component.css'
})
export class AccountScoresComponent implements OnInit {
  scores: ScoreApiInfo[] = [];
  loading = false;
  error: string | null = null;

  // Table configuration
  tableColumns: ScoreTableColumn[] = [
    {
      key: 'playCount',
      label: '#played',
      visible: true,
      align: 'center',
      // A score whose import failed midway has no files: it can't be played, flag it instead of a count
      icon: (value, score) => score.has_files === false
        ? { name: 'bootstrapExclamationTriangleFill', label: 'Files missing: the import did not finish', tone: 'danger' }
        : null
    },
    { key: 'version', label: 'Version', visible: true },
    {
      key: 'publicDomain',
      label: 'Public domain',
      visible: true,
      narrow: true,
      align: 'center',
      // A score without the flag is treated as copyrighted, like the score page does for downloads
      icon: (value) => value === true
        ? { name: 'bootstrapUnlockFill', label: 'Public domain', tone: 'positive' }
        : { name: 'bootstrapLockFill', label: 'Copyrighted, downloads restricted', tone: 'caution' }
    },
    { key: 'title', label: 'Title', visible: true },
    { key: 'author', label: 'Author', visible: true },
    { key: 'genre', label: 'Genre', visible: true },

    {
      key: 'uploaded_at',
      label: 'Uploaded',
      visible: true,
      formatter: (value) => value ? new Date(value).toLocaleString() : ''
    }
  ];

  tableActions: ScoreTableAction[] = [

  ];

  constructor(
    private scoreService: ScoreService,
    private authService: AuthService,
    private changeDetector: ChangeDetectorRef,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadUserScores();
  }

  loadUserScores() {
    const userId = this.authService.getUserId();
    if (!userId) {
      this.error = 'User not authenticated';
      return;
    }

    this.loading = true;
    this.error = null;

    this.scoreService.scoreSearchGet(undefined, userId).subscribe({
      next: (response) => {
        this.scores = response || [];
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        this.error = error.message || 'An error occurred while loading scores';
        this.loading = false;
        console.error('Error loading scores:', error);
        this.changeDetector.detectChanges();
      }
    });
  }

  refresh() {
    this.loadUserScores();
  }

  navigateToOpen() {
    this.router.navigate(['/library']);
  }

  onScoreClick(event: ScoreTableEvent) {
    this.viewScore(event.score, event.openInNewTab);
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  viewScore(score: ScoreApiInfo, openInNewTab = false) {
    const slug = score.immutableSlug || score.mutableSlug;
    if (slug) {
      if (openInNewTab) {
        window.open(`/score/${slug}`, '_blank', 'noopener');
      } else {
        this.router.navigate(['/score', slug]);
      }
    } else {
      console.error('Score slug is missing');
    }
  }
}
