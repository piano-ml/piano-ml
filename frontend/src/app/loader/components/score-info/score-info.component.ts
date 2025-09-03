import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo, GenreService, GenreApiInfo } from '../../../core/api';
import { AuthService } from '../../../account/services/auth.service';

@Component({
  selector: 'app-score-info',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './score-info.component.html',
  styleUrl: './score-info.component.css'
})
export class ScoreInfoComponent implements OnInit {
  loading = false;
  error: string | null = null;
  scoreId: string | null = null;
  score: ScoreApiInfo | null = null;
  genres: GenreApiInfo[] = [];
  loadingGenres = false;
  selectedGenre: GenreApiInfo | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private scoreService: ScoreService,
    private genreService: GenreService,
    private cdr: ChangeDetectorRef,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.scoreId = this.route.snapshot.paramMap.get('id');
    if (this.scoreId) {
      this.loadGenres();
      this.loadScore();
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

  updateSelectedGenre() {
    if (this.score?.genre_id && this.genres.length > 0) {
      this.selectedGenre = this.genres.find(g => g.id === this.score?.genre_id) || null;
    }
  }

  downloadFile(type: 'pdf' | 'musicxml' | 'midi') {
    if (!this.score?.owner_id || !this.score?.mbid || !this.score?.version) {
      this.error = 'Missing required information for download';
      return;
    }

    const revision = 1; // Default revision, adjust if needed
    
    this.scoreService.scoreOwnerMbidTypeVersionRevisionGet(
      this.score.owner_id,
      this.score.mbid,
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
    this.router.navigate(['/loader']);
  }

  editScore() {
    if (this.scoreId) {
      this.router.navigate(['/account/score/edit', this.scoreId]);
    }
  }

  isOwner(): boolean {
    const currentUserId = this.authService.getUserId();
    return !!(currentUserId && this.score?.owner_id && currentUserId === this.score.owner_id);
  }
}
