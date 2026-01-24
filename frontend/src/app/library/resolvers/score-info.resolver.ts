import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ScoreService, ScoreApiInfo } from '../../core/api';
import { catchError, of } from 'rxjs';

export const scoreInfoResolver: ResolveFn<ScoreApiInfo | null> = (route, state) => {
  const scoreService = inject(ScoreService);
  const slug = route.paramMap.get('slug');

  if (!slug) {
    return of(null);
  }

  return scoreService.scoreGetBySlug(slug).pipe(
    catchError((error) => {
      console.error('Error loading score in resolver:', error);
      return of(null);
    })
  );
};
