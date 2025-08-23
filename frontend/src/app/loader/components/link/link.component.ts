import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MusicbrainzService, MusicBrainzWork, MusicBrainzWorksResponse } from '../../../shared/services/musicbrainz.service';
import { SimplifiedWork } from './simplified-work';
@Component({
  selector: 'app-link',
  imports: [CommonModule, FormsModule],
  templateUrl: './link.component.html',
  styleUrl: './link.component.css'
})
export class LinkComponent {
  searchQuery = '';
  artistQuery = '';
  titleQuery = '';
  loading = false;
  error: string | null = null;
  response: MusicBrainzWorksResponse | null = null;
  displayedWorks: SimplifiedWork[] = [];
  showSongsOnly = true; // Par défaut, montrer seulement les chansons

  constructor(
    private musicbrainzService: MusicbrainzService,
    private router: Router,
    private changeDetector: ChangeDetectorRef
  ) { }

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
    }
    return undefined;
  }

  searchWorks() {
    if (!this.searchQuery.trim()) return;

    this.loading = true;
    this.error = null;

    this.musicbrainzService.searchWorks({ query: this.searchQuery, limit: 50 })
      .subscribe({
        next: (response) => {
          this.response = response;
          this.updateDisplayedWorks();
          this.loading = false;
        },
        error: (error) => {
          this.error = error.message || 'An error occurred while searching';
          this.loading = false;
        }
      });
  }

  searchByArtistAndTitle() {
    if (!this.artistQuery.trim() || !this.titleQuery.trim()) return;

    this.loading = true;
    this.error = null;

    this.musicbrainzService.searchWorksByArtistAndTitle(this.artistQuery, this.titleQuery, 50)
      .subscribe({
        next: (response) => {
          this.response = response;
          this.updateDisplayedWorks();
          this.loading = false;
        },
        error: (error) => {
          this.error = error.message || 'An error occurred while searching';
          this.loading = false;
        }
      });
  }

  updateDisplayedWorks() {
    if (!this.response) {
      this.displayedWorks = [];
      return;
    }
    this.response.works.forEach(work => {
      const simplified = this.fromMusicBrainzWorkToSimplified(work);
      if (simplified) {
        this.displayedWorks.push(simplified);
      }
    });
    this.changeDetector.detectChanges();
  }

  onWorkClick(work: SimplifiedWork) {
    this.router.navigate(['/open/import-work', work.mbid], {
      state: { work: work }
    });
  }

  toggleSongsOnly() {
    this.showSongsOnly = !this.showSongsOnly;
    this.updateDisplayedWorks();
  }

  clearSearch() {
    this.searchQuery = '';
    this.artistQuery = '';
    this.titleQuery = '';
    this.response = null;
    this.displayedWorks = [];
    this.error = null;
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
}
