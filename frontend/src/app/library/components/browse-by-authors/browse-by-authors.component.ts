
import { Component, EventEmitter, Input, Output, OnInit, OnChanges, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthorWithScoreCount } from '../../../core/api/model/authorWithScoreCount';
import { ScoreService } from '../../../core/api/api/score.service';

@Component({
  selector: 'app-browse-by-authors',
  imports: [RouterModule],
  templateUrl: './browse-by-authors.component.html',
  styleUrl: './browse-by-authors.component.css'
})
export class BrowseByAuthorsComponent implements OnInit, OnChanges {
  authors: AuthorWithScoreCount[] = [];
  alpha: string[] = [];
  loadingAuthors = false;
  selectedLetter: string | null = null;
  @Input() trackFilter: number[] | undefined;
  @Input() fullKeyFilter: string | undefined;
  @Input() gradeStartFilter: string | undefined;
  @Input() gradeEndFilter: string | undefined;
  @Output() authorClick = new EventEmitter<AuthorWithScoreCount>();

  constructor(
    private scoreService: ScoreService,
    private changeDetector: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe((queryParams) => {
      const letter = queryParams['letter'];
      this.selectedLetter = typeof letter === 'string' && letter.length > 0
        ? letter.charAt(0).toUpperCase()
        : null;
      this.changeDetector.detectChanges();
    });
  }

  ngOnChanges() {
    this.loadAuthors();
  }

  loadAuthors() {
    this.loadingAuthors = true;
    this.scoreService.scoreAuthorBrowseGet(
      this.trackFilter,
      this.fullKeyFilter,
      this.gradeStartFilter,
      this.gradeEndFilter,
      undefined,
      undefined,
      undefined,
      'body',
      false
    ).subscribe({
      next: (data) => {
        this.authors = data;
        this.loadingAuthors = false;
        this.alpha = Array.from(
          new Set(
            this.authors
              .map((author) => author.author.sortName?.trim().charAt(0).toUpperCase())
              .filter((letter): letter is string => !!letter)
          )
        ).sort();
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

  get filteredAuthors(): AuthorWithScoreCount[] {
    if (!this.selectedLetter) {
      return this.authors;
    }

    return this.authors.filter((author) =>
      author.author.sortName?.trim().charAt(0).toUpperCase() === this.selectedLetter
    );
  }

  isSelectedLetter(letter: string): boolean {
    return this.selectedLetter === letter;
  }
}
