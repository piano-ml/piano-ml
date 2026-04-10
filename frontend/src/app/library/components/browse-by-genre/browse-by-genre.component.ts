
import { Component, EventEmitter, Input, Output, OnChanges, ChangeDetectorRef } from '@angular/core';
import { ScoreGenreBrowseGet200ResponseInner } from '../../../core/api/model/scoreGenreBrowseGet200ResponseInner';
import { ScoreService } from '../../../core/api/api/score.service';

@Component({
  selector: 'app-browse-by-genre',
  imports: [],
  templateUrl: './browse-by-genre.component.html',
  styleUrl: './browse-by-genre.component.css'
})
export class BrowseByGenreComponent implements  OnChanges {
  genres: ScoreGenreBrowseGet200ResponseInner[] = [];
  loadingGenres = false;
  @Input() trackFilter: number[] | undefined;
  @Input() fullKeyFilter: string | undefined;
  @Input() gradeStartFilter: string | undefined;
  @Input() gradeEndFilter: string | undefined;
  @Output() genreClick = new EventEmitter<ScoreGenreBrowseGet200ResponseInner>();

  constructor(
    private scoreService: ScoreService,
    private changeDetector: ChangeDetectorRef
  ) {}


  ngOnChanges() {
    this.loadGenres();
  }

  loadGenres() {
    this.loadingGenres = true;
    this.scoreService.scoreGenreBrowseGet(
      this.trackFilter,
      this.fullKeyFilter,
      undefined,
      undefined,
      this.gradeStartFilter,
      this.gradeEndFilter,
      undefined,
      undefined,
      'body',
      false
    ).subscribe({
      next: (data) => {
        this.genres = data.map((item) => {
          if (item.genre == null) {
            item.genre = { id: 'NONE' };
          }
          return item;
        });
        this.loadingGenres = false;
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        console.error('Error loading genres:', error);
        this.loadingGenres = false;
        this.changeDetector.detectChanges();
      }
    });
  }

  onGenreClick(genre: ScoreGenreBrowseGet200ResponseInner) {
    if (genre.genre==null) {
      genre.genre= { id: 'NONE' };
    }
    this.genreClick.emit(genre);
  }
}
