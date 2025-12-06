import { Component, Input } from '@angular/core';
import { ScoreGenreBrowseGet200ResponseInner } from '../../../core/api/model/scoreGenreBrowseGet200ResponseInner';
import { ScoreService } from '../../../core/api/api/score.service';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-genre-browse',
  templateUrl: './genre-browse.component.html',
  styleUrls: ['./genre-browse.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class GenreBrowseComponent {
  @Input() trackFilter: number[] | undefined;

  genres: ScoreGenreBrowseGet200ResponseInner[] = [];
  loading = false;

  constructor(
    private scoreService: ScoreService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.loadGenres();
  }

  loadGenres() {
    this.loading = true;
    this.scoreService.scoreGenreBrowseGet('scores', this.trackFilter, 0, 100).subscribe({
      next: (data) => {
        this.genres = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading genres:', error);
        this.loading = false;
      }
    });
  }

  onGenreClick(genre: ScoreGenreBrowseGet200ResponseInner) {
    this.router.navigate(['../'], {
      relativeTo: this.route,
      queryParams: { genre: genre.genre?.id },
      queryParamsHandling: 'merge'
    });
  }
}
