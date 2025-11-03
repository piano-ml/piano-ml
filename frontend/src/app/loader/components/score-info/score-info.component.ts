import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo, GenreService, GenreApiInfo, WorkloadService, WorkloadApiInfo } from '../../../core/api';
import { AuthService } from '../../../account/services/auth.service';
import { ShareButtons } from 'ngx-sharebuttons/buttons';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapClipboard } from '@ng-icons/bootstrap-icons';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-score-info',
  standalone: true,
  imports: [CommonModule, ShareButtons, NgIcon],
  templateUrl: './score-info.component.html',
  styleUrl: './score-info.component.css',
  viewProviders: [provideIcons({ bootstrapClipboard })]
})
export class ScoreInfoComponent implements OnInit {
  loading = false;
  error: string | null = null;
  scoreId: string | null = null;
  score: ScoreApiInfo | null = null;
  genres: GenreApiInfo[] = [];
  loadingGenres = false;
  selectedGenre: GenreApiInfo | null = null;
  workload: WorkloadApiInfo | null = null;
  loadingWorkload = false;
  siteUrl = `${window.location.protocol}//${window.location.host}`;
  shareLinks = ['facebook','x','reddit','xing']
  slug: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private scoreService: ScoreService,
    private genreService: GenreService,
    private workloadService: WorkloadService,
    private cdr: ChangeDetectorRef,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.scoreId = this.route.snapshot.paramMap.get('id');
    this.slug = this.route.snapshot.paramMap.get('slug');
    this.loadGenres();
    if (this.scoreId) {
      this.loadScore();
    } else if (this.slug) {
      this.loadScoreBySlug(this.slug);
    } else {
      this.error = 'No score ID provided';
    }
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

  loadScore() {
    if (!this.scoreId) return;

    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    this.scoreService.scoreIdGet(this.scoreId).subscribe({
      next: (score) => {
        this.score = score;
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

  loadScoreBySlug(slug: string) {
    this.scoreService.scoreGetBySlug(slug).subscribe({
      next: (score) => {
        this.score = score;
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
    this.router.navigate(['/browse']);
  }

  editScore() {
    if (this.scoreId) {
      this.router.navigate(['/account/score/edit', this.scoreId]);
    }
  }

  playScore() {
    if (this.score) {
      this.router.navigate(['/desktop/workbench'], {
        state: { score: this.score }
      });
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
    return `${this.siteUrl}/work/${this.score.immutableSlug}`;
  }

  copyUrlToClipboard(): void {
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
