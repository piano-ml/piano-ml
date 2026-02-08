import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo, GenreService, GenreApiInfo } from '../../../core/api';
import { AuthService } from '../../services/auth.service';
import { AuthorSearchModalComponent } from '../author-search-modal/author-search-modal.component';
import { ScoreBasicInfoComponent } from "../../../library/components/score-basic-info/score-basic-info.component";

@Component({
  selector: 'app-edit-score',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AuthorSearchModalComponent, ScoreBasicInfoComponent],
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

  // Delete confirmation properties
  showDeleteConfirmation = false;
  deleting = false;

  // Custom dropdown properties
  showLeftHandDropdown = false;
  showRightHandDropdown = false;

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
      grade: [null, []],
      tempo: [null, [Validators.min(30), Validators.max(300)]],
      rightHandTrack: [null, []],
      leftHandTrack: [null, []]
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
    
    // Extract study tracks (remember: index 0 = right hand, index 1 = left hand)
    const rightHandTrack = score.study_tracks && score.study_tracks.length > 0 ? score.study_tracks[0] : null;
    const leftHandTrack = score.study_tracks && score.study_tracks.length > 1 ? score.study_tracks[1] : null;
    
    this.scoreForm.patchValue({
      title: score.title || '',
      author: score.author || '',
      author_id: score.author_id,  // Don't convert null to empty string
      genre_id: score.genre_id || '',
      grade: score.grade || null,
      tempo: score.tempo || null,
      rightHandTrack: rightHandTrack,
      leftHandTrack: leftHandTrack
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
    
    // Build study_tracks array (index 0 = right hand, index 1 = left hand)
    const study_tracks: number[] = [];
    if (formValue.rightHandTrack !== null && formValue.rightHandTrack !== undefined) {
      study_tracks[0] = Number(formValue.rightHandTrack);
    }
    if (formValue.leftHandTrack !== null && formValue.leftHandTrack !== undefined) {
      study_tracks[1] = Number(formValue.leftHandTrack);
    }
    
    const updatedScore: ScoreApiInfo = {
      ...this.score,
      ...formValue,
      study_tracks: study_tracks.length > 0 ? study_tracks : undefined
    };

    // Remove the form controls that don't belong to ScoreApiInfo
    delete (updatedScore as any).rightHandTrack;
    delete (updatedScore as any).leftHandTrack;

    this.scoreService.scoreIdPut(this.scoreId, updatedScore).subscribe({
      next: (response) => {
        this.success = 'Score updated successfully!';
        this.loading = false;
        this.score = response;
        this.cdr.detectChanges();
        // Navigate back to scores list after a delay
        setTimeout(() => {
          this.router.navigate(['/score/' + this.score?.immutableSlug]);
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
    this.router.navigate(['/score/' + this.score?.immutableSlug]);
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

  // Track options method
  getTrackOptions(): number[] {
    const maxTracks = this.score?.tracks_count || 255;
    const options: number[] = [];
    for (let i = 0; i <= Math.min(maxTracks - 1, 255); i++) {
      options.push(i);
    }
    return options;
  }

  // Custom dropdown methods
  toggleLeftHandDropdown() {
    this.showLeftHandDropdown = !this.showLeftHandDropdown;
    this.showRightHandDropdown = false; // Close other dropdown
  }

  toggleRightHandDropdown() {
    this.showRightHandDropdown = !this.showRightHandDropdown;
    this.showLeftHandDropdown = false; // Close other dropdown
  }

  selectLeftHand(value: number | null) {
    this.scoreForm.patchValue({ leftHandTrack: value });
    this.showLeftHandDropdown = false;
  }

  selectRightHand(value: number | null) {
    this.scoreForm.patchValue({ rightHandTrack: value });
    this.showRightHandDropdown = false;
  }

  getSelectedLeftHandLabel(): string {
    const value = this.scoreForm.get('leftHandTrack')?.value;
    if (value === null || value === undefined) {
      return 'default to midi track 1';
    }
    return `Track ${value}`;
  }

  getSelectedRightHandLabel(): string {
    const value = this.scoreForm.get('rightHandTrack')?.value;
    if (value === null || value === undefined) {
      return 'default to midi track 0';
    }
    return `Track ${value}`;
  }

  // Close dropdowns when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown-container')) {
      this.showLeftHandDropdown = false;
      this.showRightHandDropdown = false;
    }
  }

  // Delete functionality
  onDelete() {
    this.showDeleteConfirmation = true;
  }

  confirmDelete() {
    if (!this.scoreId) return;

    this.deleting = true;
    this.error = null;
    this.cdr.detectChanges();

    this.scoreService.scoreIdDelete(this.scoreId).subscribe({
      next: () => {
        this.deleting = false;
        this.showDeleteConfirmation = false;
        this.cdr.detectChanges();
        // Navigate to scores list
        this.router.navigate(['/account/scores']);
      },
      error: (error) => {
        this.error = error.message || 'Failed to delete score';
        this.deleting = false;
        this.showDeleteConfirmation = false;
        console.error('Error deleting score:', error);
        this.cdr.detectChanges();
      }
    });
  }
}
