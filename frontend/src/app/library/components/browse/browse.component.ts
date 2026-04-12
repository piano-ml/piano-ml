import { isPlatformBrowser } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, PLATFORM_ID, inject } from '@angular/core';
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
import { SeoService } from '../../../shared/services/seo.service';
import noUiSlider, { API as NoUiSliderApi, PipsMode } from 'nouislider';
import wNumb from 'wnumb';

@Component({
  selector: 'app-browse',
  templateUrl: './browse.component.html',
  styleUrl: './browse.component.css',
  imports: [
    FormsModule,
    ScoreTableComponent,
    QuickActionsComponent,
    BrowseByAuthorsComponent,
    BrowseByGenreComponent
  ]
})
export class BrowseComponent implements OnInit, AfterViewInit, OnDestroy {

  private readonly platformId = inject(PLATFORM_ID);
  private readonly newestSortBy: 'uploadedAt_desc' = 'uploadedAt_desc';
  private gradeSlider: NoUiSliderApi | null = null;
  private syncingGradeSlider = false;
  private gradeSliderHost?: ElementRef<HTMLDivElement>;

  @ViewChild('gradeSlider')
  set gradeSliderElement(element: ElementRef<HTMLDivElement> | undefined) {
    this.gradeSliderHost = element;

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (!element) {
      this.gradeSlider?.destroy();
      this.gradeSlider = null;
      return;
    }

    queueMicrotask(() => this.initializeGradeSlider());
  }

  scores: ScoreApiInfo[] = [];
  selectedAuthor: AuthorWithScoreCount | null = null;
  selectedGenre: ScoreGenreBrowseGet200ResponseInner | null = null;
  activeSearchKeyword = '';
  loading = true;
  searchKeyword = '';
  stats: ScoreStatsGet200Response | null = null;
  loadingStats = false;

  // Pagination
  currentPage = 0;
  pageSize = 100;
  hasMore = true;

  // Tab selection
  activeTab: 'new' | 'artists' | 'genres' | 'popular' = 'genres';

  // Track count filters
  filterOneHand = false;
  filterTwoHands = false;
  fullKeyOptions: string[] = [];
  selectedFullKey = '';
  loadingFullKeys = false;
  readonly minGrade = 1;
  readonly maxGrade = 8;
  selectedGradeStart = this.minGrade;
  selectedGradeEnd = this.maxGrade;
  gradeFilterPristine = true;

  // Table configuration
  tableColumns: ScoreTableColumn[] = [
    { key: 'genre', label: 'Genre', visible: true },
    { key: 'author', label: 'Artist', visible: true },
    { key: 'title', label: 'Title', visible: true },
    { key: 'duration', label: 'Duration', visible: true },    
    { key: 'grade', label: 'Grade', visible: true },    
    { key: 'tracks_count', label: 'Tracks', visible: true }
  ];

  tableActions: ScoreTableAction[] = []

  constructor(
    private scoreService: ScoreService,
    private router: Router,
    private route: ActivatedRoute,
    private changeDetector: ChangeDetectorRef,
    private seo: SeoService
  ) { }

  ngOnInit() {
      // Read the URL path to set active tab
      const path = this.route.snapshot.url[0]?.path;
      if (path) {
        this.activeTab = path as 'new' | 'artists' | 'genres' | 'popular';
      }

      // Utiliser Promise.all pour attendre la fin de loadFullKeys et loadStats

      const fullKeys$ = new Promise((resolve) => {
        this.loadingFullKeys = true;
        this.scoreService.scoreGetFullKeyGet().subscribe({
          next: (keys) => {
            this.fullKeyOptions = Array.isArray(keys) ? [...keys].sort((a, b) => a.localeCompare(b)) : [];
            if (this.selectedFullKey && !this.fullKeyOptions.includes(this.selectedFullKey)) {
              this.selectedFullKey = '';
            }
            this.loadingFullKeys = false;
            this.changeDetector.detectChanges();
            resolve(true);
          },
          error: (error) => {
            console.error('Error loading full keys:', error);
            this.loadingFullKeys = false;
            this.changeDetector.detectChanges();
            resolve(false);
          }
        });
      });

      const stats$ = new Promise((resolve) => {
        this.loadingStats = true;
        this.scoreService.scoreStatsGet().subscribe({
          next: (data) => {
            this.stats = data;
            this.loadingStats = false;
            this.changeDetector.detectChanges();
            resolve(true);
          },
          error: (error) => {
            console.error('Error loading stats:', error);
            this.loadingStats = false;
            this.changeDetector.detectChanges();
            resolve(false);
          }
        });
      });

      Promise.all([fullKeys$, stats$]).then(() => {
        // Subscribe to both params and query params to handle browser back/forward navigation
        this.route.params
          .subscribe(params => {
            const artistSlug = params['artistSlug'] || '';
            const genreSlug = params['genreSlug'] || '';
            // Hydrate track count filters from URL
            this.route.queryParams.subscribe(queryParams => {
              const keyword = queryParams['search'] || '';
              this.filterOneHand = queryParams['oneHand'] === 'true';
              this.filterTwoHands = queryParams['twoHands'] === 'true';
              this.selectedFullKey = queryParams['fullKey'] || '';
              this.selectedGradeStart = this.parseGradeParam(queryParams['gradeStart'], this.minGrade);
              this.selectedGradeEnd = this.parseGradeParam(queryParams['gradeEnd'], this.maxGrade);
              if (this.selectedGradeStart > this.selectedGradeEnd) {
                this.selectedGradeEnd = this.selectedGradeStart;
              }
              this.gradeFilterPristine = this.isDefaultGradeRange();
              this.syncGradeSliderFromState();

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

              // Update SEO après que les données initiales sont chargées et les filtres appliqués
              this.updatePageTitle();
            })
          });
      });
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeGradeSlider();
    }
  }

  ngOnDestroy() {
    this.gradeSlider?.destroy();
    this.gradeSlider = null;
  }

  loadAuthorAndFilter(artistSlug: string) {
    // Load author info from API using slug parameter
    this.loading = true;
    this.scoreService.scoreAuthorBrowseGet(
      this.getTrackCountFilter(),
      this.getFullKeyFilter(),
      this.getGradeStartFilter(),
      this.getGradeEndFilter(),
      artistSlug,
      0,
      1,
      'body',
      false
    ).subscribe({
      next: (data) => {
        if (data.length > 0) {
          const author = data[0];
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
        //this.loading = false;
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
    // Load genre info from API using slug parameter
    this.loading = true;
    this.scoreService.scoreGenreBrowseGet(
      this.getTrackCountFilter(),
      this.getFullKeyFilter(),
      genreSlug,
      undefined,
      this.getGradeStartFilter(),
      this.getGradeEndFilter(),
      0,
      1,
      'body',
      false
    ).subscribe({
      next: (data) => {
        if (data.length > 0) {
          const genre = data[0];
          this.selectedGenre = genre;
          this.selectedAuthor = null;
          this.activeSearchKeyword = '';
          this.searchKeyword = '';
          this.updatePageTitle();
          this.loadScoresByGenre(genre);
        } else {
          // Genre not found, clear filters and load all scores
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {}
          });
          this.loadScores(true);
        }
        //this.loading = false;
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

    //if (this.loading || !this.hasMore) return;

    this.loading = true;
    const offset = this.currentPage * this.pageSize;

    const trackCount = this.getTrackCountFilter();

    this.scoreService.scoreSearchGet(
      this.activeSearchKeyword || undefined, // keyword
      undefined, // ownerId
      undefined, // genreId
      undefined, // artist
      undefined, // artistSlug
      undefined, // genreSlug
      undefined, // etude
      this.getGradeStartFilter(), // gradeStart
      this.getGradeEndFilter(), // gradeEnd
      undefined, // tempo
      this.getFullKeyFilter(), // fullKey
      this.getSortByFilter(), // sortBy
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
    const basePath = '/library/' + this.activeTab;
    this.router.navigate([basePath], {
      queryParams: {
        search: this.searchKeyword,
        oneHand: this.filterOneHand || null,
        twoHands: this.filterTwoHands || null,
        fullKey: this.getFullKeyFilter() || null,
        gradeStart: this.getGradeStartFilter() || null,
        gradeEnd: this.getGradeEndFilter() || null
      }
    });

    this.loadScores(true);
  }

  onScoreClick(score: ScoreApiInfo) {
    if (score.immutableSlug) {
      this.router.navigate(['/score', score.immutableSlug]);
    }
  }

  onScoreInfo(score: ScoreApiInfo) {
    const slug = score.immutableSlug || score.mutableSlug;
    if (slug) {
      this.router.navigate(['/score', slug]);
    } else {
      console.error('Score slug is missing');
    }
  }

  loadMore() {
    if (this.selectedAuthor) {
      this.loadScoresByAuthor(this.selectedAuthor, false);
      return;
    }

    if (this.selectedGenre) {
      this.loadScoresByGenre(this.selectedGenre, false);
      return;
    }

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
        fullKey: this.getFullKeyFilter() || null,
        gradeStart: this.getGradeStartFilter() || null,
        gradeEnd: this.getGradeEndFilter() || null
      }
    });

    this.loadScoresByAuthor(author);
  }

  loadScoresByAuthor(author: AuthorWithScoreCount, reset = true) {
    if (reset) {
      this.currentPage = 0;
      this.scores = [];
      this.hasMore = true;
    }

    if (!reset && (this.loading || !this.hasMore)) return;

    this.loading = true;
    const offset = this.currentPage * this.pageSize;

    const trackCount = this.getTrackCountFilter();

    this.scoreService.scoreSearchGet(
      undefined, // keyword
      undefined, // ownerId
      undefined, // genreId
      undefined, // artist
      author.author.slug, // artistSlug
      undefined, // genreSlug
      undefined, // etude
      this.getGradeStartFilter(), // gradeStart
      this.getGradeEndFilter(), // gradeEnd
      undefined, // tempo
      this.getFullKeyFilter(), // fullKey
      undefined, // sortBy
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
        fullKey: this.getFullKeyFilter() || null,
        gradeStart: this.getGradeStartFilter() || null,
        gradeEnd: this.getGradeEndFilter() || null
      }
    });

    this.loadScoresByGenre(genre);
  }

  loadScoresByGenre(genre: ScoreGenreBrowseGet200ResponseInner, reset = true) {
    if (reset) {
      this.currentPage = 0;
      this.scores = [];
      this.hasMore = true;
    }

    if (!reset && (this.loading || !this.hasMore)) return;

    this.loading = true;
    const offset = this.currentPage * this.pageSize;

    const trackCount = this.getTrackCountFilter();

    this.scoreService.scoreSearchGet(
      undefined, // keyword
      undefined, // ownerId
      undefined, // genreId
      undefined, // artist
      undefined, // artistSlug
      genre.genre?.slug, // genreSlug
      undefined, // etude
      this.getGradeStartFilter(), // gradeStart
      this.getGradeEndFilter(), // gradeEnd
      undefined, // tempo
      this.getFullKeyFilter(), // fullKey
      undefined, // sortBy
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
    const basePath = '/library/' + this.activeTab;
    this.router.navigate([basePath]);

    this.loadScores(true);
  }

  setActiveTab(tab: 'new' | 'artists' | 'genres' | 'popular') {
    console.log('Setting active tab to', tab);
    this.activeTab = tab;
    // Navigate to the corresponding route
    const path = '/library/' + tab;
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

  getGradeStartFilter(): string | undefined {
    return this.isDefaultGradeRange() ? undefined : String(this.selectedGradeStart);
  }

  getGradeEndFilter(): string | undefined {
    return this.isDefaultGradeRange() ? undefined : String(this.selectedGradeEnd);
  }

  getSortByFilter(): 'uploadedAt_desc' | undefined {
    return this.activeTab === 'new' ? this.newestSortBy : undefined;
  }

  clearGradeFilter() {
    this.selectedGradeStart = this.minGrade;
    this.selectedGradeEnd = this.maxGrade;
    this.gradeFilterPristine = true;
    this.syncGradeSliderFromState();
    this.applyFilters();
  }

  private initializeGradeSlider() {
    if (!this.gradeSliderHost?.nativeElement) {
      return;
    }

    this.gradeSlider?.destroy();
    this.gradeSlider = noUiSlider.create(this.gradeSliderHost.nativeElement, {
      start: [this.selectedGradeStart, this.selectedGradeEnd],
      connect: true,
      behaviour: 'tap-drag',
      step: 1,
      range: {
        min: this.minGrade,
        max: this.maxGrade
      },
      pips: {
        mode: PipsMode.Values,
        values: Array.from({ length: this.maxGrade - this.minGrade + 1 }, (_, index) => this.minGrade + index),
        density: 100,
        format: wNumb({ decimals: 0 })
      },
      tooltips: false,
      format: {
        to: (value: number) => Math.round(value).toString(),
        from: (value: string) => Math.round(Number(value))
      }
    });

    this.gradeSlider.on('update', (values: (number | string)[]) => {
      const [start, end] = values.map((value) => this.clampGrade(Number(value)));
      this.selectedGradeStart = start;
      this.selectedGradeEnd = end;
      this.gradeFilterPristine = this.isDefaultGradeRange();
      this.changeDetector.detectChanges();
    });

    this.gradeSlider.on('change', (values: (number | string)[]) => {
      if (this.syncingGradeSlider) {
        return;
      }

      const [start, end] = values.map((value) => this.clampGrade(Number(value)));
      this.selectedGradeStart = start;
      this.selectedGradeEnd = end;
      this.gradeFilterPristine = this.isDefaultGradeRange();
      this.applyFilters();
    });

    this.syncGradeSliderFromState();
  }

  private syncGradeSliderFromState() {
    if (!this.gradeSlider) {
      return;
    }

    this.syncingGradeSlider = true;
    this.gradeSlider.set([this.selectedGradeStart, this.selectedGradeEnd], false);
    this.syncingGradeSlider = false;
  }

  private isDefaultGradeRange(): boolean {
    return this.selectedGradeStart === this.minGrade && this.selectedGradeEnd === this.maxGrade;
  }

  applyFilters() {
    // Update URL with current filter state, preserving route params
    if (this.selectedAuthor) {
      this.router.navigate(['/library/artists', this.selectedAuthor.author.slug], {
        queryParams: {
          oneHand: this.filterOneHand || null,
          twoHands: this.filterTwoHands || null,
          fullKey: this.getFullKeyFilter() || null,
          gradeStart: this.getGradeStartFilter() || null,
          gradeEnd: this.getGradeEndFilter() || null
        }
      });
      this.loadScoresByAuthor(this.selectedAuthor);
    } else if (this.selectedGenre) {
      this.router.navigate(['/library/genres', this.selectedGenre.genre?.slug], {
        queryParams: {
          oneHand: this.filterOneHand || null,
          twoHands: this.filterTwoHands || null,
          fullKey: this.getFullKeyFilter() || null,
          gradeStart: this.getGradeStartFilter() || null,
          gradeEnd: this.getGradeEndFilter() || null
        }
      });
      this.loadScoresByGenre(this.selectedGenre);
    } else {
      const basePath = this.activeTab === 'popular' ? '/library/' : '/library/' + this.activeTab;
      this.router.navigate([basePath], {
        queryParams: {
          oneHand: this.filterOneHand || null,
          twoHands: this.filterTwoHands || null,
          fullKey: this.getFullKeyFilter() || null,
          gradeStart: this.getGradeStartFilter() || null,
          gradeEnd: this.getGradeEndFilter() || null
        },
        queryParamsHandling: 'merge'
      });
      this.loadScores(true);
    }
  }

  private parseGradeParam(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? this.clampGrade(parsed) : fallback;
  }

  private clampGrade(value: number): number {
    return Math.min(this.maxGrade, Math.max(this.minGrade, Math.round(Number(value))));
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
    const baseUrl = 'https://pianoml.org';
    let title: string;
    let description: string;
    let url: string;
    let keywords: string;
    let structuredData: any;

    const artistKeywords = Array.from(new Set(this.scores.map(score => score.author))).join(', ');
    const titleKeywords = Array.from(new Set(this.scores.map(score => score.title))).join(', ');    
    const genreKeywords = Array.from(new Set(this.scores.map(score => score.genre))).join(', ');


    if (this.selectedGenre?.genre?.name) {
      const genreName = this.selectedGenre.genre.name.charAt(0).toUpperCase() + this.selectedGenre.genre.name.slice(1);
      title = `${genreName} Piano Scores | PianoML`;
      description = `Play ${genreName} by ${artistKeywords}`;
      url = `${baseUrl}/library/genres/${this.selectedGenre.genre.slug}`;
      keywords = `piano ${genreName}, score, pdf, musicxml, midi, ${artistKeywords}`;

      structuredData = this.seo.generateMusicCollectionStructuredData(
        this.scores,
        `${genreName} Piano Scores`,
        description
      );
    } else if (this.selectedAuthor?.author?.name) {
      const authorName = this.selectedAuthor.author.name.charAt(0).toUpperCase() + this.selectedAuthor.author.name.slice(1);
      const scoreCount = this.selectedAuthor.count;
      title = `${authorName} Piano Scores | PianoML`;
      description = `Play ${authorName} piano scores: ${titleKeywords}.`;
      url = `${baseUrl}/library/artists/${this.selectedAuthor.author.slug}`;
      keywords = `${authorName} piano, score, ${titleKeywords}`;

      structuredData = this.seo.generateMusicCollectionStructuredData(
        this.scores,
        `${authorName} Piano Works`,
        description
      );
    } else if (this.activeSearchKeyword) {
      title = `Search: "${this.activeSearchKeyword}" | PianoML Piano Scores`;
      description = `Search results for "${this.activeSearchKeyword}" : ${titleKeywords} `;
      url = `${baseUrl}/library/popular?search=${encodeURIComponent(this.activeSearchKeyword)}`;
      keywords = `piano search, ${this.activeSearchKeyword}, piano scores, sheet music`;

      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'SearchResultsPage',
        'name': title,
        'description': description
      };
    } else if (this.activeTab === 'genres') {
      // Browse by Genres page
      const totalScores = this.stats ? this.stats['public-domain'] + this.stats.copyrighted : 3000;
      title = `Browse Piano Scores by Genre | PianoML - ${genreKeywords}`;
      description = `Explore ${totalScores}+ : ${genreKeywords} piano scores on PianoML. Browse sheet music by genre and style with interactive practice features.`;
      url = `${baseUrl}/library/genres`;
      keywords = `piano, score, ${genreKeywords}`;

      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'Browse Piano Scores by Genre',
        'description': description,
        'numberOfItems': totalScores,
        'about': {
          '@type': 'Thing',
          'name': 'Piano Music Genres',
          'description': 'Collection of piano music organized by musical genre and style'
        }
      };
    } else if (this.activeTab === 'artists') {
      // Browse by Artists page
      const totalScores = this.stats ? this.stats['public-domain'] + this.stats.copyrighted : 3000;
      const artistKeywords = Array.from(new Set(this.scores.map(score => score.author))).join(', ');
      title = `Browse Piano Scores by Composer & Artist | PianoML - ${artistKeywords}`;
      description = `Discover ${totalScores}+ piano scores. Learn piano works by ${artistKeywords}.`;
      url = `${baseUrl}/library/artists`;
      keywords = `piano, score, ${artistKeywords}`;

      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'Browse Piano Scores by Composer',
        'description': description,
        'numberOfItems': totalScores,
        'about': {
          '@type': 'Thing',
          'name': 'Piano Composers and Artists',
          'description': 'Collection of piano works organized by composer and artist'
        }
      };
    } else if (this.activeTab === 'new') {
      const totalScores = this.stats ? this.stats['public-domain'] + this.stats.copyrighted : 3000;
      title = `New Piano Scores | PianoML - Latest Uploaded Sheet Music`;
      description = `Browse the latest uploaded piano scores on PianoML. Discover newly added sheet music with interactive practice tools, hands-separated practice, and MIDI support.`;
      url = `${baseUrl}/library/new`;
      keywords = 'new piano scores, latest sheet music, recent piano uploads, piano practice, interactive piano scores';

      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'New Piano Scores',
        'description': description,
        'numberOfItems': totalScores,
        'about': {
          '@type': 'CreativeWork',
          'name': 'Latest piano scores',
          'description': 'Collection of recently uploaded piano sheet music'
        }
      };
    } else {
      // Popular scores (default)
      const totalScores = this.stats ? this.stats['public-domain'] + this.stats.copyrighted : 3000;
      title = `Piano Scores Library | PianoML - MusicXML, Midi PDF Piano Sheet Music`;
      description = `Browse popular piano scores on PianoML. Interactive sheet music with hands-separated practice, adjustable speed, loopable sections, and MIDI keyboard support. Transform your piano learning experience.`;
      url = `${baseUrl}/library`;
      keywords = 'piano scores, sheet music, piano practice, free piano music, piano learning, interactive sheet music, piano learning, learning piano';

      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'Piano Score Library',
        'description': description,
        'numberOfItems': totalScores,
        'about': {
          '@type': 'SoftwareApplication',
          'name': 'PianoML - Piano Learning Machine',
          'applicationCategory': 'Music Education',
          'description': 'Piano learning platform with features for interactive practice'
        }
      };
    }
    this.seo.updateMetaTags({
      title,
      description,
      keywords,
      url,
      type: 'website',
      image: `${baseUrl}/assets/images/pianoml-og-image.jpg`,
      structuredData
    });
  }
}
