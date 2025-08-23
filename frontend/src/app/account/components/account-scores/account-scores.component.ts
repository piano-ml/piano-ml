import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ScoreService, ScoreApiInfo } from '../../../core/api';
import { AuthService } from '../../services/auth.service';
import { ScoreTableComponent, ScoreTableAction, ScoreTableColumn } from '../../../shared/components/score-table/score-table.component';

@Component({
  selector: 'app-account-scores',
  imports: [CommonModule, RouterModule, ScoreTableComponent],
  templateUrl: './account-scores.component.html',
  styleUrl: './account-scores.component.css'
})
export class AccountScoresComponent implements OnInit {
  scores: ScoreApiInfo[] = [];
  loading = false;
  error: string | null = null;

  // Table configuration
  tableColumns: ScoreTableColumn[] = [
    { key: 'title', label: 'Title', visible: true },
    { key: 'author_name', label: 'Author', visible: true },
    { key: 'version', label: 'Version', visible: true },
    { key: 'grade', label: 'Grade', visible: true },
    { key: 'duration', label: 'Duration', visible: true },
    { key: 'uploaded_at', label: 'Uploaded', visible: true }
  ];

  tableActions: ScoreTableAction[] = [
    {
      label: 'Edit',
      icon: '✏️',
      class: '',
      callback: (score) => this.editScore(score)
    },
    {
      label: 'Delete',
      icon: '🗑️',
      class: '',
      callback: (score) => this.deleteScore(score)
    }
  ];

  constructor(
    private scoreService: ScoreService,
    private authService: AuthService,
    private changeDetector: ChangeDetectorRef
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

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  editScore(score: ScoreApiInfo) {
    console.log('Edit score:', score);
    // TODO: Implement edit functionality
  }

  deleteScore(score: ScoreApiInfo) {
    console.log('Delete score:', score);
    // TODO: Implement delete functionality
    if (confirm(`Are you sure you want to delete "${score.title}"?`)) {
      // Call delete API
    }
  }
}
