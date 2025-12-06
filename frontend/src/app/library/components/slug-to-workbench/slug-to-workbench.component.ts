import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ScoreService, ScoreApiInfo } from '../../../core/api';

@Component({
  selector: 'app-slug-to-workbench',
  template: `
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-4 text-gray-600">Loading score...</p>
      </div>
    </div>
  `,
  standalone: true
})
export class SlugToWorkbenchComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private scoreService: ScoreService
  ) {}

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
    this.scoreService.scoreGetBySlug(slug).subscribe({
      next: (score: ScoreApiInfo) => {
        // Navigate to workbench with score data
        this.router.navigate(['/play/workbench'], {
          state: { score: score },
          replaceUrl: true,
          skipLocationChange: true
        });
      },
      error: (error) => {
        console.error('Error loading score:', error);
        // Fallback to score info page if workbench fails
        this.router.navigate(['/library', slug]);
      }
    });
  }
}