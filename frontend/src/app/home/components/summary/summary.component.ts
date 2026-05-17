
import { Component, inject, Inject, OnInit, DOCUMENT } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-summary',
  imports: [RouterModule],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.css'
})
export class SummaryComponent implements OnInit {
  private meta = inject(Meta);
  private titleService = inject(Title);

  summary = [
    {
      url: '/library',
      title: 'Library',
      description: 'Practice scores from the library — upload PDF, MIDI or MusicXML files — search for specific pieces, genre, grade, tonic.',
      image: 'assets/images/keyboard.webp',
      cta: 'Open library',
      keywords: 'sheet music, PDF upload, MIDI files, MusicXML, digital scores'
    },
    {
      url: '/exercises/',
      title: 'Exercises',
      description: 'Scales generator, arpeggios, and practice exercises around the circle of fifths.',
      image: 'assets/images/midi.webp',
      cta: 'Scales & exercises',
      keywords: 'piano scales, major scales, minor scales, music theory'
    },
    {
      url: '/blog/methods',
      title: 'Études for Pianists',
      description: 'Collection of digitized musical courses for classical piano study.',
      image: 'assets/images/Burgmuller-1.webp',
      cta: 'Browse collection',
      keywords: 'Burgmüller, piano études, piano methods, classical piano'
    },
    {
      url: '/blog/thanks-and-acknowledgments',
      title: 'Acknowledgments',
      description: 'The people and open-source projects that made PianoML possible.',
      image: 'assets/images/one-piece-straw-hat-luffy-black-and-white-pfp-o546iu7rtqxomb0b.webp',
      cta: 'Read more',
      keywords: 'acknowledgments, credits, contributors'
    }
  ]
  
  constructor(private route: Router, @Inject(DOCUMENT) private document: Document) {}
  
  ngOnInit() {
    // Set SEO meta tags
    this.titleService.setTitle('PianoML: Learn Piano with Smart Sheet Music & Practice Tools');
    
    this.meta.updateTag({ 
      name: 'description', 
      content: 'Learn piano with interactive exercises, scales, arpeggios, and sheet music practice. Features hands-separated practice, adjustable speed, MIDI support, real-time feedback, and a complete library of études.' 
    });
    
    this.meta.updateTag({ 
      name: 'keywords', 
      content: 'piano software, piano education software, piano lessons, piano practice, sheet music, MIDI, scales, arpeggios, études, piano interactive learning' 
    });
    
    // Open Graph tags
    this.meta.updateTag({ property: 'og:title', content: 'PianoML: Learn Piano with Smart Sheet Music & Practice Tools' });
    this.meta.updateTag({ property: 'og:description', content: 'Learn piano with interactive exercises, scales, arpeggios, and sheet music practice. Features hands-separated practice, adjustable speed, MIDI support, and real-time feedback.' });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:image', content: '/assets/images/keyboard.webp' });
    
    // Twitter Card tags
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: 'PianoML: Learn Piano with Smart Sheet Music & Practice Tools' });
    this.meta.updateTag({ name: 'twitter:description', content: 'Interactive piano learning with exercises, scales, sheet music practice, and ML-powered feedback' });
    
    // Add JSON-LD structured data
    this.addStructuredData();
  }
  
  private addStructuredData() {
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "PianoML",
      "applicationCategory": "EducationalApplication",
      "description": "Learn piano with interactive exercises, scales, arpeggios, and sheet music practice. Features hands-separated practice, adjustable speed, MIDI support, real-time feedback, and a complete library of études.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "featureList": [
        "Interactive piano scales generator",
        "Arpeggios exercises",
        "Sheet music generation from audio and MIDI",
        "Hands-separated practice mode",
        "Adjustable playback speed",
        "MIDI keyboard support with real-time feedback",
        "PDF, MIDI, and MusicXML file upload",
        "Collection of digitized piano études",
        "Machine Learning-powered feedback"
      ],
      "about": [
        {
          "@type": "Thing",
          "name": "Piano Education"
        },
        {
          "@type": "Thing",
          "name": "Music Theory"
        },
        {
          "@type": "Thing",
          "name": "Machine Learning"
        }
      ]
    };
    
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData);
    this.document.head.appendChild(script);
  }
}
