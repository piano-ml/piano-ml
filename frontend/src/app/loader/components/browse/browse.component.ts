import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ScoreService } from '../../../core/api/api/score.service';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { AuthorWithScoreCount } from '../../../core/api/model/authorWithScoreCount';
import { ScoreStatsGet200Response } from '../../../core/api/model/scoreStatsGet200Response';
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
  authors: AuthorWithScoreCount[] = [];
  selectedAuthor: AuthorWithScoreCount | null = null;
  activeSearchKeyword = '';
  loading = false;
  loadingAuthors = false;
  searchKeyword = '';
  stats: ScoreStatsGet200Response | null = null;
  loadingStats = false;

  // Pagination
  currentPage = 0;
  pageSize = 10;
  hasMore = true;

  // Table configuration
  tableColumns: ScoreTableColumn[] = [
    { key: 'title', label: 'Title', visible: true },
    { key: 'author', label: 'Artist', visible: true },
    { key: 'genre', label: 'Genre', visible: true },
    { key: 'grade', label: 'Grade', visible: true },
    { key: 'duration', label: 'Duration', visible: true },
    { key: 'tracks_count', label: 'Tracks', visible: true }
  ];

  tableActions: ScoreTableAction[] = [
    {
      label: 'Info',
      icon: '',
      class: '',
      callback: (score) => this.onScoreInfo(score)
    }
  ];

  constructor(
    private scoreService: ScoreService,
    private router: Router,
    private route: ActivatedRoute,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadAuthors();
    this.loadStats();
    
    // Subscribe to query params to handle browser back/forward navigation
    this.route.queryParams.subscribe(params => {
      const keyword = params['search'] || '';
      const authorId = params['author'] || '';

      if (keyword) {
        this.searchKeyword = keyword;
        this.activeSearchKeyword = keyword;
        this.selectedAuthor = null;
        this.loadScores(true);
      } else if (authorId) {
        // Load author info and then filter scores
        this.loadAuthorAndFilter(authorId);
      } else {
        // No filters, load all scores
        this.activeSearchKeyword = '';
        this.searchKeyword = '';
        this.selectedAuthor = null;
        this.loadScores(true);
      }
    });
  }

  loadAuthorAndFilter(authorId: string) {
    // Try to find author in already loaded list first
    const existingAuthor = this.authors.find(a => a.author.id === authorId);
    if (existingAuthor) {
      this.selectedAuthor = existingAuthor;
      this.activeSearchKeyword = '';
      this.searchKeyword = '';
      this.loadScoresByAuthor(existingAuthor);
      return;
    }

    // If not found, load more authors
    this.loadingAuthors = true;
    this.scoreService.scoreAuthorBrowseGet(0, 100).subscribe({
      next: (data) => {
        const author = data.find(a => a.author.id === authorId);
        if (author) {
          this.selectedAuthor = author;
          this.activeSearchKeyword = '';
          this.searchKeyword = '';
          this.loadScoresByAuthor(author);
        } else {
          // Author not found, clear filters and load all scores
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {}
          });
          this.loadScores(true);
        }
        this.loadingAuthors = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading author:', error);
        this.loadingAuthors = false;
        this.loadScores(true);
        this.changeDetector.detectChanges();
      }
    });
  }

  loadAuthors() {
    this.loadingAuthors = true;
    //this.scoreService.scoreAuthorBrowseGet(0, 20).subscribe({
    this.scoreService.scoreAuthorBrowseGet().subscribe({
      next: (data) => {
        this.authors = data;
        this.loadingAuthors = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading authors:', error);
        this.loadingAuthors = false;
        this.changeDetector.detectChanges();
      }
    });
  }

  loadStats() {
    this.loadingStats = true;
    this.scoreService.scoreStatsGet().subscribe({
      next: (data) => {
        this.stats = data;
        this.loadingStats = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading stats:', error);
        this.loadingStats = false;
        this.changeDetector.detectChanges();
      }
    });
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
    this.activeSearchKeyword = this.searchKeyword;
    this.selectedAuthor = null;
    
    // Update URL with search parameter, clear author parameter
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: this.searchKeyword, author: null }
    });
    
    this.loadScores(true);
  }

  onScoreClick(score: ScoreApiInfo) {
    if (score.immutableSlug) {
      this.router.navigate(['/work', score.immutableSlug]);
    }
  }

  onScoreInfo(score: ScoreApiInfo) {
    if (score.id) {
      this.router.navigate([score.id, 'info'], { relativeTo: this.route });
    }
  }

  loadMore() {
    this.loadScores();
  }

  onAuthorClick(author: AuthorWithScoreCount) {
    this.selectedAuthor = author;
    this.searchKeyword = '';
    this.activeSearchKeyword = '';
    
    // Update URL with author parameter, clear search parameter
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { author: author.author.id, search: null }
    });
    
    this.loadScoresByAuthor(author);
  }

  loadScoresByAuthor(author: AuthorWithScoreCount) {
    this.currentPage = 0;
    this.scores = [];
    this.hasMore = true;
    this.loading = true;

    this.scoreService.scoreSearchGet(
      undefined, // keyword
      undefined, // ownerId
      undefined, // genreId
      author.author.id, // artist (using author ID)
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      0, // offset
      this.pageSize
    ).subscribe({
      next: (data) => {
        this.scores = data;
        this.hasMore = data.length === this.pageSize;
        this.currentPage = 1;
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading scores by author:', error);
        this.loading = false;
        this.changeDetector.detectChanges();
      }
    });
  }

  clearAuthorFilter() {
    this.selectedAuthor = null;
    
    // Clear URL parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {}
    });
    
    this.loadScores(true);
  }

  clearSearchFilter() {
    this.activeSearchKeyword = '';
    this.searchKeyword = '';
    
    // Clear URL parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {}
    });
    
    this.loadScores(true);
  }
}
