import { Component, ChangeDetectorRef, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MusicbrainzService, MusicBrainzWork, MusicBrainzWorksResponse, MusicBrainzArtistsResponse, MusicBrainzArtistDetailed } from '../../../shared/services/musicbrainz.service';
import { SimplifiedWork } from './simplified-work';
import { AuthService } from '../../../account/services/auth.service';
@Component({
  selector: 'app-link',
  imports: [FormsModule, RouterModule],
  templateUrl: './link.component.html',
  styleUrl: './link.component.css'
})
export class LinkComponent implements OnInit, AfterViewInit {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  searchQuery = '';
  loading = false;
  error: string | null = null;
  response: MusicBrainzWorksResponse | null = null;
  displayedWorks: SimplifiedWork[] = [];
  showSongsOnly = true; // Par défaut, montrer seulement les chansons
  isLoggedIn = false;
  hasSearched = false; // Track if a search has been performed

  // Manual creation workflow
  showManualCreation = false;
  manualCreationStep: 'artist' | 'title' | null = null;
  artistSearchQuery = '';
  artistResponse: MusicBrainzArtistsResponse | null = null;
  selectedArtist: MusicBrainzArtistDetailed | null = null;
  workTitle = '';

  constructor(
    private musicbrainzService: MusicbrainzService,
    private router: Router,
    private changeDetector: ChangeDetectorRef,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.authService.isLoggedIn.subscribe(isLoggedIn => {
      this.isLoggedIn = isLoggedIn;
      if (isLoggedIn) {
        this.focusSearchInput();
      }
    });
  }

  ngAfterViewInit() {
    this.focusSearchInput();
  }

  private focusSearchInput() {
    setTimeout(() => {
      if (typeof this.searchInput?.nativeElement?.focus === 'function') {
        this.searchInput.nativeElement.focus();
      }
    });
  }

  fromMusicBrainzWorkToSimplified(work: MusicBrainzWork): SimplifiedWork | undefined {

    //    const artistCredit = work['artist-credit'] && work['artist-credit'].length > 0 ? work['artist-credit'][0] : null;
    for (const rel of work.relations || []) {
      if (rel.type === 'composer' && rel.artist) {
        return {
          mbid: work.id,
          title: work.title,
          artistMbId: rel.artist.id,
          artistName: rel.artist.name,
        };
      }
      if (rel.artist) {
        return {
          mbid: work.id,
          title: work.title,
          artistMbId: rel.artist.id,
          artistName: rel.artist.name,
        };
      }


    }
    return undefined;
  }

  searchWorks() {
    if (!this.searchQuery.trim()) return;

    this.loading = true;
    this.error = null;
    this.response = null;
    this.displayedWorks = [];
    this.hasSearched = true; // Mark that a search has been performed
    this.changeDetector.detectChanges();

    this.musicbrainzService.searchWorks({ query: this.searchQuery, limit: 50 })
      .subscribe({
        next: (response) => {
          this.response = response;
          this.updateDisplayedWorks();
          this.loading = false;
          this.changeDetector.detectChanges();
        },
        error: (error) => {
          this.error = error.message || 'An error occurred while searching';
          this.loading = false;
          this.changeDetector.detectChanges();
        }
      });
  }



  updateDisplayedWorks() {
    if (!this.response) {
      this.displayedWorks = [];
      return;
    }
    
    // Réinitialiser le tableau avant d'ajouter les nouveaux résultats
    this.displayedWorks = [];
    
    this.response.works.forEach(work => {
      const simplified = this.fromMusicBrainzWorkToSimplified(work);
      if (simplified) {
        this.displayedWorks.push(simplified);
      }
    });
    
    this.changeDetector.detectChanges();
  }

  onWorkClick(work: SimplifiedWork) {
    this.router.navigate(['/import/import-work', work.mbid], {
      state: { work: work },
      skipLocationChange: true
    });
  }

  toggleSongsOnly() {
    this.showSongsOnly = !this.showSongsOnly;
    this.updateDisplayedWorks();
  }

  clearSearch() {
    this.searchQuery = '';
    this.response = null;
    this.displayedWorks = [];
    this.error = null;
    this.hasSearched = false; // Reset search state
  }

  getComposers(work: MusicBrainzWork): string[] {
    return this.musicbrainzService.getComposers(work);
  }

  getLyricists(work: MusicBrainzWork): string[] {
    return this.musicbrainzService.getLyricists(work);
  }

  getRecordings(work: MusicBrainzWork) {
    return this.musicbrainzService.getRecordings(work);
  }

  getPrimaryLanguage(work: MusicBrainzWork): string {
    const lang = this.musicbrainzService.getPrimaryLanguage(work);
    return lang === 'unknown' ? 'N/A' : lang.toUpperCase();
  }

  getComposersList(work: MusicBrainzWork): string {
    const composers = this.getComposers(work);
    return composers.length > 0 ? composers.join(', ') : 'N/A';
  }

  getLyricistsList(work: MusicBrainzWork): string {
    const lyricists = this.getLyricists(work);
    return lyricists.length > 0 ? lyricists.join(', ') : 'N/A';
  }

  // Manual creation workflow methods
  startManualCreation() {
    this.showManualCreation = true;
    this.manualCreationStep = 'artist';
    this.artistSearchQuery = '';
    this.artistResponse = null;
    this.selectedArtist = null;
    this.workTitle = '';
    this.error = null;
  }

  cancelManualCreation() {
    this.showManualCreation = false;
    this.manualCreationStep = null;
    this.artistSearchQuery = '';
    this.artistResponse = null;
    this.selectedArtist = null;
    this.workTitle = '';
  }

  searchArtists() {
    if (!this.artistSearchQuery.trim()) return;

    this.loading = true;
    this.error = null;
    this.artistResponse = null;
    this.changeDetector.detectChanges();

    this.musicbrainzService.searchArtistsByName(this.artistSearchQuery, 50)
      .subscribe({
        next: (response) => {
          this.artistResponse = response;
          this.loading = false;
          this.changeDetector.detectChanges();
        },
        error: (error) => {
          this.error = error.message || 'An error occurred while searching artists';
          this.loading = false;
          this.changeDetector.detectChanges();
        }
      });
  }

  onArtistSelect(artist: MusicBrainzArtistDetailed) {
    this.selectedArtist = artist;
    this.manualCreationStep = 'title';
    this.workTitle = '';
  }

  backToArtistSearch() {
    this.manualCreationStep = 'artist';
    this.selectedArtist = null;
    this.workTitle = '';
  }

  submitManualWork() {
    if (!this.selectedArtist || !this.workTitle.trim()) return;

    const manualWork: SimplifiedWork = {
      // No MBID for manually created works - don't include it at all
      title: this.workTitle.trim(),
      artistMbId: this.selectedArtist.id,
      artistName: this.selectedArtist.name,
    };

    this.router.navigate(['/import/import-work', 'manual'], {
      state: { work: manualWork },
      skipLocationChange: true
    });
  }

}
