import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
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
  fullKeyOptions: string[] = [];
  selectedFullKey = '';
  loadingFullKeys = false;

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
    private changeDetector: ChangeDetectorRef,
    private titleService: Title
  ) { }

  ngOnInit() {
    this.loadFullKeys();
    this.loadStats();
    this.updatePageTitle();
    // Read the URL path to set active tab
    const path = this.route.snapshot.url[0]?.path;
    if (path === 'genres') {
      this.activeTab = 'genres';
    } else if (path === 'artists') {
      this.activeTab = 'authors';
    }
    
    // Subscribe to both params and query params to handle browser back/forward navigation
    this.route.params.subscribe(params => {
      const artistSlug = params['artistSlug'] || '';
      const genreSlug = params['genreSlug'] || '';
      
      // Hydrate track count filters from URL
      this.route.queryParams.subscribe(queryParams => {
        const keyword = queryParams['search'] || '';
        this.filterOneHand = queryParams['oneHand'] === 'true';
        this.filterTwoHands = queryParams['twoHands'] === 'true';
        this.selectedFullKey = queryParams['fullKey'] || '';
        
        if (keyword) {
          this.searchKeyword = keyword;
          this.activeSearchKeyword = keyword;
          this.selectedAuthor = null;
          this.selectedGenre = null;
          this.loadScores(true);
        } else if (artistSlug) {
          // Load author info and then filter scores
          this.loadAuthorAndFilter(artistSlug);
        } else if (genreSlug) {
          // Load genre info and then filter scores
          this.loadGenreAndFilter(genreSlug);
        } else {
          // No filters, load all scores
          this.activeSearchKeyword = '';
          this.searchKeyword = '';
          this.selectedAuthor = null;
          this.selectedGenre = null;
          this.loadScores(true);
        }
      });
    });
  }

  loadAuthorAndFilter(artistSlug: string) {
    // Load author info from API
    this.loading = true;
    this.scoreService.scoreAuthorBrowseGet(this.getTrackCountFilter(), this.getFullKeyFilter(), 0, 100).subscribe({
      next: (data) => {
        const author = data.find(a => a.author.slug === artistSlug);
        if (author) {
          this.selectedAuthor = author;
          this.selectedGenre = null;
          this.activeSearchKeyword = '';
          this.searchKeyword = '';
          this.updatePageTitle();
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

  loadGenreAndFilter(genreSlug: string) {
    // Load genre info from API
    this.loading = true;
    this.scoreService.scoreGenreBrowseGet(this.getTrackCountFilter(), this.getFullKeyFilter(), undefined, 0, 100).subscribe({
      next: (data) => {
        const genre = data.find(g => g.genre?.slug === genreSlug);
        if (genre) {
          this.selectedGenre = genre;
          this.selectedAuthor = null;
          this.activeSearchKeyword = '';
          this.searchKeyword = '';
          this.updatePageTitle();
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
      this.searchKeyword || undefined, // keyword
      undefined, // ownerId
      undefined, // genreId
      undefined, // artist
      undefined, // artistSlug
      undefined, // genreSlug
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      undefined, // tempo
      this.getFullKeyFilter(), // fullKey
      offset, // offset
      this.pageSize, // limit
      trackCount // tracks
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
    
    // Navigate to base browse route with search query param
    const basePath = this.activeTab === 'authors' ? '/library/artists' : '/library/genres';
    this.router.navigate([basePath], {
      queryParams: { 
        search: this.searchKeyword,
        oneHand: this.filterOneHand || null,
        twoHands: this.filterTwoHands || null,
        fullKey: this.getFullKeyFilter() || null
      }
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
    this.updatePageTitle();
    
    // Navigate to /library/artists/:artistSlug
    this.router.navigate(['/library/artists', author.author.slug], {
      queryParams: { 
        oneHand: this.filterOneHand || null,
        twoHands: this.filterTwoHands || null,
        fullKey: this.getFullKeyFilter() || null
      }
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
      undefined, // artist
      author.author.slug, // artistSlug
      undefined, // genreSlug
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      undefined, // tempo
      this.getFullKeyFilter(), // fullKey
      0, // offset
      this.pageSize, // limit
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
    this.updatePageTitle();

    // Navigate to /library/genres/:genreSlug
    this.router.navigate(['/library/genres', genre.genre?.slug], {
      queryParams: { 
        oneHand: this.filterOneHand || null,
        twoHands: this.filterTwoHands || null,
        fullKey: this.getFullKeyFilter() || null
      }
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
      undefined, // genreId
      undefined, // artist
      undefined, // artistSlug
      genre.genre?.slug, // genreSlug
      undefined, // etude
      undefined, // gradeStart
      undefined, // gradeEnd
      undefined, // tempo
      this.getFullKeyFilter(), // fullKey
      0, // offset
      this.pageSize, // limit
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
    this.updatePageTitle();
    
    // Navigate back to /library/artists
    this.router.navigate(['/library/artists']);
    
    this.loadScores(true);
  }

  clearGenreFilter() {
    this.selectedGenre = null;
    this.updatePageTitle();
    
    // Navigate back to /library/genres
    this.router.navigate(['/library/genres']);
    
    this.loadScores(true);
  }

  clearSearchFilter() {
    this.activeSearchKeyword = '';
    this.searchKeyword = '';
    this.updatePageTitle();
    
    // Navigate to base browse route
    const basePath = this.activeTab === 'authors' ? '/library/artists' : '/library/genres';
    this.router.navigate([basePath]);
    
    this.loadScores(true);
  }

  setActiveTab(tab: 'authors' | 'genres') {
    this.activeTab = tab;
    // Navigate to the corresponding route
    const path = tab === 'authors' ? '/library/artists' : '/library/genres';
    this.router.navigate([path], {
      queryParamsHandling: 'preserve'
    });
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

  getFullKeyFilter(): string | undefined {
    return this.selectedFullKey || undefined;
  }

  applyFilters() {
    // Update URL with current filter state, preserving route params
    if (this.selectedAuthor) {
      this.router.navigate(['/library/artists', this.selectedAuthor.author.slug], {
        queryParams: { 
          oneHand: this.filterOneHand || null,
          twoHands: this.filterTwoHands || null,
          fullKey: this.getFullKeyFilter() || null
        }
      });
      this.loadScoresByAuthor(this.selectedAuthor);
    } else if (this.selectedGenre) {
      this.router.navigate(['/library/genres', this.selectedGenre.genre?.slug], {
        queryParams: { 
          oneHand: this.filterOneHand || null,
          twoHands: this.filterTwoHands || null,
          fullKey: this.getFullKeyFilter() || null
        }
      });
      this.loadScoresByGenre(this.selectedGenre);
    } else {
      const basePath = this.activeTab === 'authors' ? '/library/artists' : '/library/genres';
      this.router.navigate([basePath], {
        queryParams: { 
          oneHand: this.filterOneHand || null,
          twoHands: this.filterTwoHands || null,
          fullKey: this.getFullKeyFilter() || null
        },
        queryParamsHandling: 'merge'
      });
      this.loadScores(true);
    }
  }

  loadFullKeys() {
    this.loadingFullKeys = true;
    this.scoreService.scoreGetFullKeyGet().subscribe({
      next: (keys) => {
        this.fullKeyOptions = Array.isArray(keys) ? [...keys].sort((a, b) => a.localeCompare(b)) : [];
        if (this.selectedFullKey && !this.fullKeyOptions.includes(this.selectedFullKey)) {
          this.selectedFullKey = '';
        }
        this.loadingFullKeys = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading full keys:', error);
        this.loadingFullKeys = false;
        this.changeDetector.detectChanges();
      }
    });
  }

  updatePageTitle() {
    if (this.selectedGenre?.genre?.name) {
      this.titleService.setTitle(`PianoML: ${this.selectedGenre.genre.name} piano scores`);
    } else if (this.selectedAuthor?.author?.name) {
      this.titleService.setTitle(`PianoML: ${this.selectedAuthor.author.name} piano scores`);
    } else {
      this.titleService.setTitle('PianoML: piano scores');
    }
  }
}
