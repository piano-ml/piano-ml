import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ScoreService } from '../../../core/api/api/score.service';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { ScoreTableComponent, ScoreTableAction, ScoreTableColumn } from '../../../shared/components/score-table/score-table.component';
import { QuickActionsComponent } from '../../../shared/components/quick-actions/quick-actions.component';

@Component({
  selector: 'app-browse',
  imports: [CommonModule, FormsModule, ScoreTableComponent, QuickActionsComponent],
  templateUrl: './browse.component.html',
  styleUrl: './browse.component.css'
})
export class BrowseComponent implements OnInit {

  scores: ScoreApiInfo[] = [];
  loading = false;
  searchKeyword = '';

  // Pagination
  currentPage = 0;
  pageSize = 10;
  hasMore = true;

  // Table configuration
  tableColumns: ScoreTableColumn[] = [
    { key: 'title', label: 'Title', visible: true },
    { key: 'author', label: 'Artist', visible: true },
    { key: 'genre', label: 'Genre', visible: true },
    { key: 'grade', label: 'Difficulty', visible: true },
    { key: 'duration', label: 'Duration', visible: true },
    { key: 'tracks_count', label: 'Tracks', visible: true }
  ];

  tableActions: ScoreTableAction[] = [
    {
      label: 'Info',
      icon: '',
      class: '',
      callback: (score) => this.onScoreInfo(score)
    },
    {
      label: 'Select',
      icon: '',
      class: '',
      callback: (score) => this.onScoreClick(score)
    }
  ];

  constructor(
    private scoreService: ScoreService,
    private router: Router,
    private route: ActivatedRoute,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadScores();
  }

  loadScores(reset = false) {
    if (reset) {
      this.currentPage = 0;
      this.scores = [];
      this.hasMore = true;
    }

    if (this.loading || !this.hasMore) return;

    this.loading = true;
    const offset = this.currentPage * this.pageSize;
    console.log("offset:", offset);

    this.scoreService.scoreSearchGet(
      this.searchKeyword || undefined,
      undefined, // genreId
      undefined, // genreId
      undefined, // gradeStart
      undefined, // gradeEnd
      offset,
      this.pageSize
    ).subscribe({
      next: (data) => {
        if (reset) {
          this.scores = data;
        } else {
          this.scores = [...this.scores, ...data];
        }

        this.hasMore = data.length === this.pageSize;
        this.currentPage++;
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading scores:', error);
        this.loading = false;
        this.changeDetector.detectChanges();
      }
    });

  }

  onSearch() {
    this.loadScores(true);
  }

  onScoreClick(score: ScoreApiInfo) {

    if (score.id) {
    console.log('Score clicked:', score);
      this.router.navigate(['/desktop/workbench'], { 
        state: { score: score }
      });
    }
  }

  onScoreInfo(score: ScoreApiInfo) {
    if (score.id) {
      console.log('Score info clicked:', score);
      this.router.navigate([score.id, 'info'], { relativeTo: this.route });
    }
  }

  loadMore() {
    this.loadScores();
  }
}
