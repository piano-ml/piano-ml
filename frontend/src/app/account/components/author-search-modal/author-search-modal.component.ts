import { Component, EventEmitter, Input, Output, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicbrainzService } from '../../../core/api/api/musicbrainz.service';
import { MbAuthorApiInfo } from '../../../core/api/model/mbAuthorApiInfo';

@Component({
  selector: 'app-author-search-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" *ngIf="isOpen" (click)="onBackdropClick($event)">
      <div class="bg-neutral-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold text-white">Select Author</h2>
          <button (click)="close()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <!-- Search Input -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-300 mb-2">Search for an author:</label>
          <div class="flex gap-2">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (keyup.enter)="searchAuthors()"
              class="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300 text-black"
              placeholder="Enter author name...">
            <button
              (click)="searchAuthors()"
              [disabled]="!searchQuery || searching"
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
              {{ searching ? 'Searching...' : 'Search' }}
            </button>
          </div>
        </div>

        <!-- Search Results -->
        <div *ngIf="searchResults.length > 0" class="mb-4">
          <h3 class="text-lg font-medium text-white mb-2">Search Results:</h3>
          <div class="space-y-2 max-h-60 overflow-y-auto">
            <div
              *ngFor="let author of searchResults"
              (click)="selectAuthor(author)"
              class="p-3 bg-neutral-700 rounded cursor-pointer hover:bg-neutral-600 transition-colors">
              <div class="text-white font-medium">{{ author.name }}</div>
              <div class="text-gray-400 text-sm">{{ author.disambiguation || 'No additional info' }}</div>
              <div class="text-gray-500 text-xs">ID: {{ author.id }}</div>
            </div>
          </div>
        </div>

        <!-- No Results -->
        <div *ngIf="searchQuery && !searching && searchResults.length === 0 && hasSearched" class="mb-4">
          <p class="text-gray-400">No authors found for "{{ searchQuery }}"</p>
        </div>

        <!-- Error -->
        <div *ngIf="error" class="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {{ error }}
        </div>

        <!-- Manual Entry Option -->
        <div class="border-t border-neutral-600 pt-4">
          <p class="text-gray-300 mb-2">Can't find the author?</p>
          <div class="flex gap-2">
            <input
              type="text"
              [(ngModel)]="manualAuthor"
              class="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300 text-black"
              placeholder="Enter author name manually...">
            <button
              (click)="selectManualAuthor()"
              [disabled]="!manualAuthor"
              class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
              Use Manual Entry
            </button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-end gap-4 mt-6">
          <button (click)="close()" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class AuthorSearchModalComponent implements OnInit {
  @Input() isOpen = false;
  @Input() currentAuthor: string | null = null;
  @Input() currentAuthorId: string | null = null;
  @Output() authorSelected = new EventEmitter<{author: string | null, author_id: string | null}>();
  @Output() closeModal = new EventEmitter<void>();

  searchQuery = '';
  manualAuthor = '';
  searchResults: MbAuthorApiInfo[] = [];
  searching = false;
  hasSearched = false;
  error: string | null = null;

  constructor(private musicbrainzService: MusicbrainzService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    if (this.currentAuthor) {
      this.searchQuery = this.currentAuthor;
      this.manualAuthor = this.currentAuthor;
    }
  }

  onBackdropClick(event: Event) {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close() {
    this.closeModal.emit();
  }

  searchAuthors() {
    if (!this.searchQuery.trim()) return;

    this.searching = true;
    this.error = null;
    this.searchResults = [];
    this.hasSearched = false;
    this.cdr.detectChanges();

    this.musicbrainzService.artistSearchQueryGet(this.searchQuery.trim()).subscribe({
      next: (result: any) => {
        // Assuming the API returns an array of authors or a single author
        if (Array.isArray(result)) {
          this.searchResults = result;
        } else if (result && typeof result === 'object') {
          // If it's a single object, wrap it in an array
          this.searchResults = [result as MbAuthorApiInfo];
        } else {
          this.searchResults = [];
        }
        this.searching = false;
        this.hasSearched = true;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.error('Error searching authors:', error);
        this.error = error.message || 'Failed to search authors';
        this.searching = false;
        this.hasSearched = true;
        this.searchResults = [];
        this.cdr.detectChanges();
      }
    });
  }

  selectAuthor(author: MbAuthorApiInfo) {
    this.authorSelected.emit({
      author: author.name || null,
      author_id: author.id || null
    });
    this.close();
  }

  selectManualAuthor() {
    if (!this.manualAuthor.trim()) return;
    
    this.authorSelected.emit({
      author: this.manualAuthor.trim(),
      author_id: null
    });
    this.close();
  }
}
