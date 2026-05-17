import { Component, EventEmitter, HostListener, Input, Output, OnInit, ChangeDetectorRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MusicbrainzService } from '../../../core/api/api/musicbrainz.service';
import { MbAuthorApiInfo } from '../../../core/api/model/mbAuthorApiInfo';

@Component({
  selector: 'app-author-search-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (isOpen) {
      <div
        class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[12vh] z-50 px-4"
        (click)="onBackdropClick($event)">
        <div
          class="bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
          (click)="$event.stopPropagation()">

          <!-- Search row -->
          <div class="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-800">
            <svg class="w-4 h-4 text-neutral-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="6"/><path stroke-linecap="round" d="M20 20l-3.5-3.5"/>
            </svg>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (keyup.enter)="searchAuthors()"
              class="flex-1 bg-transparent text-sm text-neutral-100 placeholder-neutral-500 outline-none"
              placeholder="Search composer…"
              autofocus>
            @if (searching) {
              <div class="spinner w-3.5 h-3.5 text-neutral-500 shrink-0"></div>
            } @else if (searchQuery) {
              <button type="button" (click)="searchAuthors()" class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors shrink-0 px-1">↵</button>
            }
          </div>

          <!-- Body -->
          <div class="max-h-[320px] overflow-y-auto">

            <!-- Error -->
            @if (error) {
              <div class="px-4 py-3 border-b border-neutral-800">
                <p class="text-xs text-red-400">{{ error }}</p>
              </div>
            }

            <!-- Results -->
            @if (searchResults.length > 0) {
              <div class="py-1">
                @for (author of searchResults; track author) {
                  <button
                    type="button"
                    (click)="selectAuthor(author)"
                    class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left group">
                    <div class="w-7 h-7 rounded-full bg-neutral-800 group-hover:bg-neutral-700 flex items-center justify-center text-xs font-semibold text-neutral-400 shrink-0 transition-colors select-none">
                      {{ author.name?.charAt(0)?.toUpperCase() }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-neutral-200 truncate">{{ author.name }}</p>
                      @if (author.disambiguation) {
                        <p class="text-xs text-neutral-500 truncate">{{ author.disambiguation }}</p>
                      }
                    </div>
                    <span class="text-xs text-neutral-600 group-hover:text-neutral-400 transition-colors shrink-0">Select ↵</span>
                  </button>
                }
              </div>
            }

            <!-- No results -->
            @if (hasSearched && !searching && searchResults.length === 0) {
              <div class="px-4 py-10 text-center">
                <p class="text-sm text-neutral-500">No results for "{{ searchQuery }}"</p>
                <p class="text-xs text-neutral-600 mt-1">Try a different spelling or use the name directly below</p>
              </div>
            }

            <!-- Initial prompt -->
            @if (!hasSearched && !searching && !error) {
              <div class="px-4 py-10 text-center">
                <p class="text-xs text-neutral-600">Type a name and press ↵ to search MusicBrainz</p>
              </div>
            }

          </div>

          <!-- Use as author (escape hatch) -->
          @if (searchQuery) {
            <div class="border-t border-neutral-800">
              <button
                type="button"
                (click)="manualAuthor = searchQuery; selectManualAuthor()"
                class="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition-colors text-left group">
                <div class="w-7 h-7 rounded-full border border-dashed border-neutral-700 group-hover:border-neutral-500 flex items-center justify-center text-neutral-600 group-hover:text-neutral-400 text-base shrink-0 transition-colors">+</div>
                <div>
                  <p class="text-sm text-neutral-400">Use <span class="text-neutral-200">"{{ searchQuery }}"</span> as author</p>
                  <p class="text-xs text-neutral-600">Without MusicBrainz link</p>
                </div>
              </button>
            </div>
          }

          <!-- Dismiss bar -->
          <div class="border-t border-neutral-800 px-4 py-2.5 flex justify-between items-center">
            <span class="text-xs text-neutral-600">esc to close</span>
            <button type="button" (click)="close()" class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">Cancel</button>
          </div>

        </div>
      </div>
    }
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

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen) this.close();
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
