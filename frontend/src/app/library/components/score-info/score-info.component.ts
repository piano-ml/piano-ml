import { Component, OnInit, ChangeDetectorRef, PLATFORM_ID, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo, GenreService, GenreApiInfo, WorkloadService, WorkloadApiInfo, YoutubeVideoApiInfo } from '../../../core/api';
import { AuthService } from '../../../account/services/auth.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapClipboard, bootstrapDownload, bootstrapPencil } from '@ng-icons/bootstrap-icons';
import { ScoreBasicInfoComponent } from '../score-basic-info/score-basic-info.component';
import { ResponseStatusService, SeoService } from '../../../shared/seo';
import { buildScoreSeo } from './score-info.seo';
import { ExercisesInKeyComponent } from '../../../shared/components/exercises-in-key/exercises-in-key.component';
import { VideoCarouselComponent } from './components/video-carousel/video-carousel.component';
import { VideoPlayerModalComponent } from './components/video-player-modal/video-player-modal.component';

@Component({
  selector: 'app-score-info',
  standalone: true,
  imports: [CommonModule, NgIcon, ScoreBasicInfoComponent, ExercisesInKeyComponent, VideoCarouselComponent, VideoPlayerModalComponent],
  templateUrl: './score-info.component.html',
  styleUrl: './score-info.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  viewProviders: [provideIcons({ bootstrapClipboard, bootstrapDownload, bootstrapPencil })]
})
export class ScoreInfoComponent implements OnInit {
  loading = false;
  error: string | null = null;
  score: ScoreApiInfo | null = null;
  genres: GenreApiInfo[] = [];
  loadingGenres = false;
  selectedGenre: GenreApiInfo | null = null;
  workload: WorkloadApiInfo | null = null;
  loadingWorkload = false;
  videos: YoutubeVideoApiInfo[] = [];
  loadingVideos = false;
  videosError: string | null = null;
  selectedVideo: YoutubeVideoApiInfo | null = null;
  isVideoPlayerOpen = false;
  siteUrl = '';
  shareLinks = ['facebook', 'x', 'reddit', 'xing']
  slug: string | null = null;
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private scoreService: ScoreService,
    private genreService: GenreService,
    private workloadService: WorkloadService,
    private cdr: ChangeDetectorRef,
    private authService: AuthService,
    private seo: SeoService,
    private responseStatus: ResponseStatusService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.siteUrl = `${window.location.protocol}//${window.location.host}`;
    } else {
      this.siteUrl = 'https://pianoml.org';
    }
  }

  ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug');
    this.loadGenres();
    if (!this.slug) {
      this.error = 'No score slug provided';
      this.responseStatus.set(404);
      this.updatePageTitle(null);
      return;
    }
    this.loadScoreBySlug(this.slug);
  }


  loadGenres() {
    this.loadingGenres = true;
    this.cdr.detectChanges();
    this.genreService.genreGet().subscribe({
      next: (genres) => {
        this.genres = genres || [];
        this.loadingGenres = false;
        this.updateSelectedGenre();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading genres:', error);
        this.loadingGenres = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadScoreBySlug(slug: string) {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    this.scoreService.scoreGetBySlug(slug).subscribe({
      next: (score) => {
        this.score = score;
        this.updatePageTitle(score);
        this.updateSelectedGenre();
        this.loading = false;
        this.loadVideos(score.id || '');
        // Load workload info if score doesn't have files
        if (!score.has_files && score.id) {
          this.loadWorkload(score.id);
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.error = error.message || 'Failed to load score';
        this.loading = false;
        // No score behind this slug: noindex either way, and a real 404 when
        // that is what the API said, so the unbounded slug space stays out of
        // the index rather than answering 200 with the site defaults.
        if (error?.status === 404) {
          this.responseStatus.set(404);
        }
        this.updatePageTitle(null);
        console.error('Error loading score:', error);
        this.cdr.detectChanges();
      }
    });
  }

  loadVideos(scoreId: string) {
    if (!scoreId) {
      this.videos = [];
      this.videosError = null;
      this.loadingVideos = false;
      return;
    }

    this.loadingVideos = true;
    this.videosError = null;
    this.cdr.detectChanges();

    this.scoreService.scoreIdVideoGet(scoreId).subscribe({
      next: (videos) => {
        this.videos = (videos || []).filter(video => !!video.videoId);
        this.loadingVideos = false;
        // The videos become VideoObject entries in the page's JSON-LD.
        this.updatePageTitle(this.score);
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.videosError = error?.message || 'Failed to load videos';
        this.videos = [];
        this.loadingVideos = false;
        console.error('Error loading videos:', error);
        this.cdr.detectChanges();
      }
    });
  }

  openVideoPlayer(video: YoutubeVideoApiInfo): void {
    if (!video.videoId) {
      return;
    }

    this.selectedVideo = video;
    this.isVideoPlayerOpen = true;
  }

  closeVideoPlayer(): void {
    this.isVideoPlayerOpen = false;
    this.selectedVideo = null;
  }

  private updatePageTitle(score: ScoreApiInfo | null) {
    this.seo.update(buildScoreSeo({
      score,
      slug: this.slug,
      genreName: this.selectedGenre?.name,
      videos: this.videos
    }));
  }


  loadWorkload(scoreId: string) {
    this.loadingWorkload = true;
    this.cdr.detectChanges();

    this.workloadService.workloadIdGet(scoreId).subscribe({
      next: (workload) => {
        this.workload = workload;
        this.loadingWorkload = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading workload:', error);
        this.loadingWorkload = false;
        this.cdr.detectChanges();
      }
    });
  }

  updateSelectedGenre() {
    if (this.score?.genre_id && this.genres.length > 0) {
      this.selectedGenre = this.genres.find(g => g.id === this.score?.genre_id) || null;
      // The genre feeds the description and the JSON-LD, so refresh them once
      // it is known — genres and the score itself load independently.
      this.updatePageTitle(this.score);
    }
  }

  downloadFile(type: 'pdf' | 'musicxml' | 'midi') {
    if (!this.isOwnerOrPublic()) {
      return;
    }

    if (!this.score?.owner_id || !this.score?.id || !this.score?.version) {
      this.error = 'Missing required information for download';
      return;
    }

    const revision = 1; // Default revision, adjust if needed

    this.scoreService.scoreOwnerIdTypeVersionRevisionGet(
      this.score.owner_id,
      this.score.id!,
      type,
      this.score.version,
      revision
    ).subscribe({
      next: (blob: Blob) => {
        this.downloadBlob(blob, type);
      },
      error: (error) => {
        console.error(`Error downloading ${type}:`, error);
        this.error = `Failed to download ${type} file`;
        this.cdr.detectChanges();
      }
    });
  }

  private downloadBlob(blob: Blob, type: string) {
    if (!this.isBrowser) {
      return;
    }

    if (type === 'pdf') {
      // For PDF, create a new blob with correct MIME type and open inline
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      window.location.href = url;
      // Clean up the URL after a delay to allow the browser to load it
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
    } else {
      // For other file types, download as before
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Generate filename
      const filename = `${this.score?.title || 'score'}_${this.score?.id || 'unknown'}.${type === 'musicxml' ? 'xml' : type}`;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  }

  onBack() {
    this.router.navigate(['/library']);
  }

  editScore() {
    if (this.score?.id) {
      this.router.navigate(['/account/score/edit', this.score.id]);
    }
  }

  playScore() {
    if (this.score) {
      this.router.navigate(['/work/' + this.score.immutableSlug]);
    }
  }

  isOwner(): boolean {
    const currentUserId = this.authService.getUserId();
    return this.authService.isAdmin() || !!(currentUserId && this.score?.owner_id && currentUserId === this.score.owner_id);
  }


  isOwnerOrPublic(): boolean {
    return this.isOwner() || !!(this.score?.publicDomain);
  }


  getPublicUrl(): string | null {
    if (!this.score?.immutableSlug) {
      return null;
    }
    return `${this.siteUrl}/score/${this.score.immutableSlug}`;
  }

  copyUrlToClipboard(): void {
    if (!this.isBrowser) {
      return;
    }

    const url = this.getPublicUrl();
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;

    if (!url) {
      return;
    }

    if (!clipboard) {
      this.fallbackCopyTextToClipboard(url);
      return;
    }

    clipboard.writeText(url).then(() => {
      // Optionally show a success message
      console.log('URL copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy URL: ', err);
      // Fallback method
      this.fallbackCopyTextToClipboard(url);
    });
  }

  private fallbackCopyTextToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      console.log('Fallback: URL copied to clipboard');
    } catch (err) {
      console.error('Fallback: Failed to copy', err);
    }
    document.body.removeChild(textArea);
  }
}
