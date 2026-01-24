import { Component, OnInit, ChangeDetectorRef, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ScoreService, ScoreApiInfo, GenreService, GenreApiInfo, WorkloadService, WorkloadApiInfo } from '../../../core/api';
import { AuthService } from '../../../account/services/auth.service';
import { ShareButtons } from 'ngx-sharebuttons/buttons';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapClipboard } from '@ng-icons/bootstrap-icons';
import { ScoreBasicInfoComponent } from '../score-basic-info/score-basic-info.component';
import { SeoService } from '../../../shared/services/seo.service';
import { ExercisesInKeyComponent } from '../../../shared/components/exercises-in-key/exercises-in-key.component';

@Component({
  selector: 'app-score-info',
  standalone: true,
  imports: [CommonModule, ShareButtons, NgIcon, ScoreBasicInfoComponent, ExercisesInKeyComponent],
  templateUrl: './score-info.component.html',
  styleUrl: './score-info.component.css',
  viewProviders: [provideIcons({ bootstrapClipboard })]
})
export class ScoreInfoComponent implements OnInit {
  loading = false;
  error: string | null = null;
  score: ScoreApiInfo | null = null;
  pageTitle = 'Score';
  genres: GenreApiInfo[] = [];
  loadingGenres = false;
  selectedGenre: GenreApiInfo | null = null;
  workload: WorkloadApiInfo | null = null;
  loadingWorkload = false;
  siteUrl = '';
  shareLinks = ['facebook','x','reddit','xing']
  slug: string | null = null;
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private title: Title,
    private scoreService: ScoreService,
    private genreService: GenreService,
    private workloadService: WorkloadService,
    private cdr: ChangeDetectorRef,
    private authService: AuthService,
    private seo: SeoService
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
        // Load workload info if score doesn't have files
        if (!score.has_files && score.id) {
          this.loadWorkload(score.id);
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.error = error.message || 'Failed to load score';
        this.loading = false;
        console.error('Error loading score:', error);
        this.cdr.detectChanges();
      }
    });
  }

  private buildScorePageTitle(score: ScoreApiInfo | null): string {
    if (!score) {
      return 'Score';
    }

    const authorName = (score.author || '').trim();
    const scoreName = (score.title || '').trim();

    const base = `${authorName} - ${scoreName}`.trim();
    return base ? `${base} piano score` : 'Score';
  }

  private updatePageTitle(score: ScoreApiInfo | null) {
    if (!score) {
      this.pageTitle = 'Score';
      return;
    }

    const authorName = (score.author || 'Unknown Artist').trim();
    const scoreName = (score.title || 'Untitled').trim();
    const genreName = this.selectedGenre?.name || score.genre || '';
    const duration = score.duration ? Math.round(score.duration) : 0;
    const tracks = score.tracks_count || 0;

    // Build SEO-friendly title
    const title = `${scoreName} by ${authorName} | Free Piano Sheet Music - PianoML`;
    this.pageTitle = `${authorName} - ${scoreName} piano score`;

    // Build rich description
    let description = `Play ${scoreName} by ${authorName} on PianoML. `;
    if (genreName) {
      description += `${genreName} piano music. `;
    }
    description += `Interactive sheet music with hands-separated practice, adjustable speed, loop sections, and MIDI support. `;
    if (score.publicDomain) {
      description += `Free public domain piano score. `;
    }
    if (duration > 0) {
      description += `Duration: ${duration}s. `;
    }
    if (tracks > 0) {
      description += `${tracks} ${tracks === 1 ? 'track' : 'tracks'}.`;
    }

    // Keywords
    const keywords = [
      `${scoreName} piano`,
      `${authorName} piano`,
      `${scoreName} sheet music`,
      `${authorName} compositions`,
      'piano score',
      'piano practice',
      'interactive sheet music',
      'piano learning machine'
    ];
    if (genreName) {
      keywords.push(`${genreName} piano`);
    }
    if (score.publicDomain) {
      keywords.push('public domain piano', 'free piano music');
    }

    // URL
    const url = `${this.siteUrl}/score/${score.immutableSlug || score.mutableSlug || this.slug}`;

    // Structured Data
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'MusicComposition',
      'name': scoreName,
      'composer': {
        '@type': 'Person',
        'name': authorName
      },
      'inLanguage': 'en',
      'url': url
    };

    // if (genreName) {
    //   structuredData['genre'] = genreName;
    // }

    // if (duration > 0) {
    //   structuredData['duration'] = `PT${duration}S`;
    // }

    // if (score.publicDomain) {
    //   structuredData['license'] = 'https://creativecommons.org/publicdomain/zero/1.0/';
    // }

    // Update SEO tags
    this.seo.updateMetaTags({
      title,
      description: description.trim(),
      keywords: keywords.join(', '),
      url,
      type: 'music.song',
      image: `${this.siteUrl}/assets/images/pianoml-og-image.jpg`,
      structuredData
    });
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
    }
  }

  downloadFile(type: 'pdf' | 'musicxml' | 'midi') {
    if (!this.score?.publicDomain) {
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
    return !!(currentUserId && this.score?.owner_id && currentUserId === this.score.owner_id);
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
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        // Optionally show a success message
        console.log('URL copied to clipboard');
      }).catch(err => {
        console.error('Failed to copy URL: ', err);
        // Fallback method
        this.fallbackCopyTextToClipboard(url);
      });
    }
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
