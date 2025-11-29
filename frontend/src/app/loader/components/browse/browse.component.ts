import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ScoreService } from '../../../core/api/api/score.service';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { AuthorWithScoreCount } from '../../../core/api/model/authorWithScoreCount';
import { ScoreGenreBrowseGet200ResponseInner } from '../../../core/api/model/scoreGenreBrowseGet200ResponseInner';
import { ScoreStatsGet200Response } from '../../../core/api/model/scoreStatsGet200Response';
import { ScoreTableComponent, ScoreTableAction, ScoreTableColumn } from '../../../shared/components/score-table/score-table.component';
import { QuickActionsComponent } from '../../../shared/components/quick-actions/quick-actions.component';
import { BrowseByAuthorsComponent } from '../browse-by-authors/browse-by-authors.component';
import { BrowseByGenreComponent } from '../browse-by-genre/browse-by-genre.component';

@Component({
  selector: 'app-browse',
  imports: [CommonModule, FormsModule, ScoreTableComponent, QuickActionsComponent, BrowseByAuthorsComponent, BrowseByGenreComponent],
  templateUrl: './browse.component.html',
  styleUrl: './browse.component.css'
})
export class BrowseComponent implements OnInit {

  scores: ScoreApiInfo[] = [];
  selectedAuthor: AuthorWithScoreCount | null = null;
  selectedGenre: ScoreGenreBrowseGet200ResponseInner | null = null;
  activeSearchKeyword = '';
  loading = false;
  searchKeyword = '';
  stats: ScoreStatsGet200Response | null = null;
  loadingStats = false;

  // Pagination
  currentPage = 0;
  pageSize = 100;
  hasMore = true;

  // Tab selection
  activeTab: 'authors' | 'genres' = 'genres';

  // Track count filters
  filterOneHand = false;
  filterTwoHands = false;

  // Table configuration
  tableColumns: ScoreTableColumn[] = [
    { key: 'playCount', label: 'Play#', visible: true },
    { key: 'title', label: 'Title', visible: true },
    { key: 'author', label: 'Artist', visible: true },
    { key: 'genre', label: 'Genre', visible: true },
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
    this.loadStats();
    
    // Subscribe to query params to handle browser back/forward navigation
    this.route.queryParams.subscribe(params => {
      const keyword = params['search'] || '';
      const authorId = params['author'] || '';
      const genreId = params['genre'] || '';
      if (keyword) {
        this.searchKeyword = keyword;
        this.activeSearchKeyword = keyword;
        this.selectedAuthor = null;
        this.selectedGenre = null;
        this.loadScores(true);
      } else if (authorId) {
        // Load author info and then filter scores
        this.loadAuthorAndFilter(authorId);
      } else if (genreId) {
        // Load genre info and then filter scores
        this.loadGenreAndFilter(genreId);
      } else {
        // No filters, load all scores
        this.activeSearchKeyword = '';
        this.searchKeyword = '';
        this.selectedAuthor = null;
        this.selectedGenre = null;
        this.loadScores(true);
      }
    });
  }

  loadAuthorAndFilter(authorId: string) {
    // Load author info from API
    this.loading = true;
    this.scoreService.scoreAuthorBrowseGet(undefined, 0, 100).subscribe({
      next: (data) => {
        const author = data.find(a => a.author.id === authorId);
        if (author) {
          this.selectedAuthor = author;
          this.selectedGenre = null;
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
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading author:', error);
        this.loading = false;
        this.loadScores(true);
        this.changeDetector.detectChanges();
      }
    });
  }

  loadGenreAndFilter(genreId: string) {
    // Load genre info from API
    this.loading = true;
    this.scoreService.scoreGenreBrowseGet(undefined, undefined, 0, 100).subscribe({
      next: (data) => {
        const genre = data.find(g => g.genre?.id === genreId);
        if (genre) {
          this.selectedGenre = genre;
          this.selectedAuthor = null;
          this.activeSearchKeyword = '';
          this.searchKeyword = '';
          this.loadScoresByGenre(genre);
        } else {
          // Genre not found, clear filters and load all scores
          // this.router.navigate([], {
          //   relativeTo: this.route,
          //   queryParams: {}
          // });
          // this.loadScores(true);
        }
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading genre:', error);
        this.loading = false;
        this.loadScores(true);
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

    const trackCount = this.getTrackCountFilter();

    this.scoreService.scoreSearchGet(
      this.searchKeyword || undefined,
      undefined, // ownerId
      undefined, // genreId
      undefined, // artist
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      undefined, // tempo
      offset,
      this.pageSize,
      trackCount
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
    this.selectedGenre = null;
    
    // Update URL with search parameter, clear author and genre parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: this.searchKeyword, author: null, genre: null }
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
    this.selectedGenre = null;
    this.searchKeyword = '';
    this.activeSearchKeyword = '';
    
    // Update URL with author parameter, clear search and genre parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { author: author.author.id, search: null, genre: null }
    });
    
    this.loadScoresByAuthor(author);
  }

  loadScoresByAuthor(author: AuthorWithScoreCount) {
    this.currentPage = 0;
    this.scores = [];
    this.hasMore = true;
    this.loading = true;

    const trackCount = this.getTrackCountFilter();

    this.scoreService.scoreSearchGet(
      undefined, // keyword
      undefined, // ownerId
      undefined, // genreId
      author.author.id, // artist (using author ID)
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      undefined, // tempo
      0, // offset
      this.pageSize,
      trackCount // tracks
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

  onGenreClick(genre: ScoreGenreBrowseGet200ResponseInner) {
    this.selectedGenre = genre;
    this.selectedAuthor = null;
    this.searchKeyword = '';
    this.activeSearchKeyword = '';

    // Update URL with genre parameter, clear search and author parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { genre: genre.genre?.id, search: null, author: null }
    });
    
    this.loadScoresByGenre(genre);
  }

  loadScoresByGenre(genre: ScoreGenreBrowseGet200ResponseInner) {
    this.currentPage = 0;
    this.scores = [];
    this.hasMore = true;
    this.loading = true;

    const trackCount = this.getTrackCountFilter();

    this.scoreService.scoreSearchGet(
      undefined, // keyword
      undefined, // ownerId
      genre.genre?.id, // genreId
      undefined, // artist
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      undefined, // tempo
      0, // offset
      this.pageSize,
      trackCount // tracks
    ).subscribe({
      next: (data) => {
        this.scores = data;
        this.hasMore = data.length === this.pageSize;
        this.currentPage = 1;
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading scores by genre:', error);
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

  clearGenreFilter() {
    this.selectedGenre = null;
    
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

  setActiveTab(tab: 'authors' | 'genres') {
    this.activeTab = tab;
  }

  getTrackCountFilter(): number[] | undefined {
    const tracks: number[] = [];
    if (this.filterOneHand) {
      tracks.push(1);
    }
    if (this.filterTwoHands) {
      tracks.push(2);
    }
    return tracks.length > 0 ? tracks : undefined;
  }

  applyFilters() {
    // Reload scores with the new filter
    if (this.selectedAuthor) {
      this.loadScoresByAuthor(this.selectedAuthor);
    } else if (this.selectedGenre) {
      this.loadScoresByGenre(this.selectedGenre);
    } else {
      this.loadScores(true);
    }
  }
}
