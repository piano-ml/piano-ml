import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo } from '../../../core/api';
import { WorkbenchComponent } from '../workbench/workbench.component';

@Component({
  selector: 'app-slug-to-workbench',
  template: `
    <ng-container *ngIf="loaded; else loadingOrError">
      <app-workbench></app-workbench>
    </ng-container>

    <ng-template #loadingOrError>
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-center">
          <div *ngIf="!error" class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p class="mt-4 text-gray-600">{{ error ?? 'Loading score...' }}</p>
        </div>
      </div>
    </ng-template>
  `,
  imports: [CommonModule, WorkbenchComponent],
  standalone: true
})
export class SlugToWorkbenchComponent implements OnInit {

  loaded = false;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private scoreService: ScoreService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      console.error('No slug provided');
      this.router.navigate(['/library']);
      return;
    }

    this.loadScoreAndNavigate(slug);
  }

  private loadScoreAndNavigate(slug: string) {
    console.log(`Loading score with slug: ${slug}`);
    this.scoreService.scoreGetBySlug(slug).subscribe({
      next: (score: ScoreApiInfo) => {
        // WorkbenchComponent récupère le score via navigation extras state ou window.history.state.
        // Ici on hydrate window.history.state AVANT de créer <app-workbench>.
        console.log('Score loaded successfully:', score);
        try {
          window.history.replaceState(
            {
              ...window.history.state,
              score,
              fromStorage: false
            },
            ''
          );
        } catch (e) {
          console.warn('Failed to set history state for Workbench:', e);
        }

        this.loaded = true;
        console.log("loaded set to true, navigating to WorkbenchComponent", this.loaded);

        // Dans certains setups (events coalescing / transitions), le template peut rester figé
        // sans un tick explicite.
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading score:', error);
        this.error = 'Unable to load score.';
        // Fallback: retourner à la bibliothèque si le slug est invalide.
        this.router.navigate(['/library']);
      }
    });
  }
}