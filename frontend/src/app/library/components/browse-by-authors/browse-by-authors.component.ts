import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit, OnChanges, ChangeDetectorRef } from '@angular/core';
import { AuthorWithScoreCount } from '../../../core/api/model/authorWithScoreCount';
import { ScoreService } from '../../../core/api/api/score.service';

@Component({
  selector: 'app-browse-by-authors',
  imports: [CommonModule],
  templateUrl: './browse-by-authors.component.html',
  styleUrl: './browse-by-authors.component.css'
})
export class BrowseByAuthorsComponent implements OnInit, OnChanges {
  authors: AuthorWithScoreCount[] = [];
  alpha : string[] | undefined ;
  loadingAuthors = false;
  @Input() trackFilter: number[] | undefined;
  @Input() fullKeyFilter: string | undefined;
  @Output() authorClick = new EventEmitter<AuthorWithScoreCount>();

  constructor(
    private scoreService: ScoreService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit() {
    //this.loadAuthors();
  }

  ngOnChanges() {
    this.loadAuthors();
  }

  loadAuthors() {
    this.loadingAuthors = true;
    this.scoreService.scoreAuthorBrowseGet(this.trackFilter, this.fullKeyFilter).subscribe({
      next: (data) => {
        this.authors = data;
        this.loadingAuthors = false;
        this.alpha = Array.from(new Set(this.authors.map(a => a.author.name?.charAt(0).toUpperCase()).filter((c): c is string => c !== undefined))).sort();
        this.changeDetector.detectChanges();

      },
      error: (error) => {
        console.error('Error loading authors:', error);
        this.loadingAuthors = false;
        this.changeDetector.detectChanges();
      }
    });
  }

  onAuthorClick(author: AuthorWithScoreCount) {
    this.authorClick.emit(author);
  }
}
