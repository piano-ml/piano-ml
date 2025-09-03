import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo, GenreService, GenreApiInfo } from '../../../core/api';
import { AuthService } from '../../services/auth.service';
import { AuthorSearchModalComponent } from '../author-search-modal/author-search-modal.component';

@Component({
  selector: 'app-edit-score',
  imports: [CommonModule, ReactiveFormsModule, AuthorSearchModalComponent],
  templateUrl: './edit-score.component.html',
  styleUrl: './edit-score.component.css'
})
export class EditScoreComponent implements OnInit {
  scoreForm: FormGroup;
  loading = false;
  error: string | null = null;
  success: string | null = null;
  scoreId: string | null = null;
  score: ScoreApiInfo | null = null;
  genres: GenreApiInfo[] = [];
  loadingGenres = false;
  
  // Author modal properties
  isAuthorModalOpen = false;
  selectedAuthor: string | null = null;
  selectedAuthorId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private scoreService: ScoreService,
    private authService: AuthService,
    private genreService: GenreService,
    private cdr: ChangeDetectorRef
  ) {
    this.scoreForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      author: ['', [Validators.maxLength(255)]],
      author_id: ['', []],
      genre_id: ['', []],
      grade: [null, []]
    });
  }

  ngOnInit() {
    this.scoreId = this.route.snapshot.paramMap.get('id');
    if (this.scoreId) {
      // Disable genre_id control initially while loading
      const genreControl = this.scoreForm.get('genre_id');
      if (genreControl) {
        genreControl.disable();
      }
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
        // Update the genre_id control state based on loading
        const genreControl = this.scoreForm.get('genre_id');
        if (genreControl) {
          if (this.loadingGenres) {
            genreControl.disable();
          } else {
            genreControl.enable();
          }
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading genres:', error);
        this.loadingGenres = false;
        // Continue without genres if there's an error
        const genreControl = this.scoreForm.get('genre_id');
        if (genreControl) {
          genreControl.enable();
        }
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
        this.populateForm(score);
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

  populateForm(score: ScoreApiInfo) {
    this.selectedAuthor = score.author || null;
    this.selectedAuthorId = score.author_id || null;
    
    this.scoreForm.patchValue({
      title: score.title || '',
      author: score.author || '',
      author_id: score.author_id,  // Don't convert null to empty string
      genre_id: score.genre_id || '',
      grade: score.grade || null
    });
  }

  onSubmit() {
    if (this.scoreForm.invalid || !this.scoreId) {
      this.markFormGroupTouched();
      return;
    }

    this.loading = true;
    this.error = null;
    this.success = null;
    this.cdr.detectChanges();

    const formValue = this.scoreForm.value;
    const updatedScore: ScoreApiInfo = {
      ...this.score,
      ...formValue
    };

    this.scoreService.scoreIdPut(this.scoreId, updatedScore).subscribe({
      next: (response) => {
        this.success = 'Score updated successfully!';
        this.loading = false;
        this.score = response;
        this.cdr.detectChanges();
        // Navigate back to scores list after a delay
        setTimeout(() => {
          this.router.navigate(['/account/scores']);
        }, 2000);
      },
      error: (error) => {
        this.error = error.message || 'Failed to update score';
        this.loading = false;
        console.error('Error updating score:', error);
        this.cdr.detectChanges();
      }
    });
  }

  onCancel() {
    this.router.navigate(['/account/scores']);
  }

  // Author modal methods
  openAuthorModal() {
    this.isAuthorModalOpen = true;
  }

  closeAuthorModal() {
    this.isAuthorModalOpen = false;
  }

  onAuthorSelected(selection: {author: string | null, author_id: string | null}) {
    this.selectedAuthor = selection.author;
    this.selectedAuthorId = selection.author_id;
    
    // Update form with selected author
    this.scoreForm.patchValue({
      author: selection.author || '',
      author_id: selection.author_id  // Don't convert null to empty string
    });
    
    this.isAuthorModalOpen = false;
  }

  private markFormGroupTouched() {
    Object.keys(this.scoreForm.controls).forEach(key => {
      const control = this.scoreForm.get(key);
      control?.markAsTouched();
    });
  }

  // Helper methods for form validation
  isFieldInvalid(fieldName: string): boolean {
    const field = this.scoreForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.scoreForm.get(fieldName);
    if (field && field.errors && (field.dirty || field.touched)) {
      if (field.errors['required']) {
        return `${fieldName} is required`;
      }
      if (field.errors['maxlength']) {
        return `${fieldName} is too long`;
      }
      if (field.errors['min']) {
        return `${fieldName} must be at least ${field.errors['min'].min}`;
      }
      if (field.errors['max']) {
        return `${fieldName} must be at most ${field.errors['max'].max}`;
      }
    }
    return '';
  }
}
