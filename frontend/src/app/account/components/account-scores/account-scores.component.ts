import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo } from '../../../core/api';
import { AuthService } from '../../services/auth.service';
import { ScoreTableComponent, ScoreTableAction, ScoreTableColumn } from '../../../shared/components/score-table/score-table.component';
import { QuickActionsComponent } from '../../../shared/components/quick-actions/quick-actions.component';

@Component({
  selector: 'app-account-scores',
  imports: [CommonModule, RouterModule, ScoreTableComponent, QuickActionsComponent],
  templateUrl: './account-scores.component.html',
  styleUrl: './account-scores.component.css'
})
export class AccountScoresComponent implements OnInit {
  scores: ScoreApiInfo[] = [];
  loading = false;
  error: string | null = null;

  // Table configuration
  tableColumns: ScoreTableColumn[] = [
    {
      key: 'has_files',
      label: '',
      visible: true,
      formatter: (value, score) => score.has_files === false ? '⚠️' : '✅'
    },
    { key: 'playCount', label: '#played', visible: true },
    { key: 'version', label: 'Version', visible: true },
    { key: 'publicDomain', label: 'Public Domain', visible: true },
    {
      key: 'title',
      label: 'Title',
      visible: true,
      formatter: (value, score) => score.publicDomain ? (score.title || '') : '🔒' + (score.title || '')
    },
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
    {
      label: 'Info',
      class: 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors',
      callback: (score) => this.viewScore(score)
    }
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
    this.router.navigate(['/browse']);
  }

  onScoreClick(score: ScoreApiInfo) {
    this.viewScore(score);
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  viewScore(score: ScoreApiInfo) {
    if (score.id) {
      this.router.navigate(['/browse', score.id, 'info']);
    } else {
      console.error('Score ID is missing');
    }
  }
}
