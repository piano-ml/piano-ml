import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, type AfterViewInit, inject, PLATFORM_ID } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';
import { noop } from 'rxjs';
import { HomeglComponent } from '../homegl/homegl.component';

@Component({
  selector: 'app-home',
  imports: [RouterModule, HomeglComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements AfterViewInit {

  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor(private router: Router, private titleService: Title, private metaService: Meta) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    
    // SEO: Page Title
    this.titleService.setTitle('PianoML: Learn Piano with Smart Sheet Music & Practice Tools');
    
    // SEO: Meta Tags
    this.metaService.addTags([
      { name: 'description', content: 'Learn piano with PianoML: A free, open-source web app supporting MusicXML, MIDI, and PDF sheet music. Practice scales, get instant feedback, and build your personal music library with OMR technology.' },
      { name: 'keywords', content: 'midi, piano, learning, app, score, free, music' },
      { name: 'author', content: 'PianoML' },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:title', content: 'PianoML: Learn Piano with Smart Sheet Music & Practice Tools' },
      { property: 'og:description', content: 'Free piano learning app supporting MusicXML, MIDI, and PDF files. Practice scales, get instant feedback, and organize your music library.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://www.pianoml.com' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'PianoML: Learn Piano with Smart Sheet Music & Practice Tools' },
      { name: 'twitter:description', content: 'Free piano learning app supporting MusicXML, MIDI, and PDF files. Practice scales and get instant feedback.' },
      { name: 'application-name', content: 'PianoML' },
      { name: 'apple-mobile-web-app-title', content: 'PianoML' },
      { name: 'mobile-web-app-capable', content: 'yes' }
    ]);
  }

  summary() {
    this.router.navigate(['summary']);
  }

  ngAfterViewInit(): void {
    // Warm up the server (ignore response and errors)
    void this.http.get('/account/userinfo').subscribe({
      next: noop,
      error: noop
    });
  }

}
