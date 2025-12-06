import { Component, Input } from '@angular/core';
import { AuthorWithScoreCount } from '../../../core/api/model/authorWithScoreCount';
import { ScoreService } from '../../../core/api/api/score.service';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-artist-browse',
  templateUrl: './artist-browse.component.html',
  styleUrls: ['./artist-browse.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class ArtistBrowseComponent {
  @Input() trackFilter: number[] | undefined;

  authors: AuthorWithScoreCount[] = [];
  loading = false;

  constructor(
    private scoreService: ScoreService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.loadAuthors();
  }

  loadAuthors() {
    this.loading = true;
    this.scoreService.scoreAuthorBrowseGet(this.trackFilter, 0, 100).subscribe({
      next: (data) => {
        this.authors = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading authors:', error);
        this.loading = false;
      }
    });
  }

  onAuthorClick(author: AuthorWithScoreCount) {
    this.router.navigate(['../'], {
      relativeTo: this.route,
      queryParams: { author: author.author.id },
      queryParamsHandling: 'merge'
    });
  }
}
