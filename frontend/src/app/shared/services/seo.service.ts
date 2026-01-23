import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { isPlatformBrowser } from '@angular/common';

export interface SeoData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  structuredData?: any;
}

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private meta = inject(Meta);
  private titleService = inject(Title);
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  /**
   * Met à jour toutes les métadonnées SEO de la page
   */
  updateMetaTags(data: SeoData): void {
    // Title
    if (data.title) {
      this.titleService.setTitle(data.title);
    }

    // Description
    if (data.description) {
      this.meta.updateTag({ name: 'description', content: data.description });
      this.meta.updateTag({ property: 'og:description', content: data.description });
      this.meta.updateTag({ name: 'twitter:description', content: data.description });
    }

    // Keywords
    if (data.keywords) {
      this.meta.updateTag({ name: 'keywords', content: data.keywords });
    }

    // Open Graph tags
    if (data.title) {
      this.meta.updateTag({ property: 'og:title', content: data.title });
      this.meta.updateTag({ name: 'twitter:title', content: data.title });
    }

    if (data.image) {
      this.meta.updateTag({ property: 'og:image', content: data.image });
      this.meta.updateTag({ name: 'twitter:image', content: data.image });
    }

    if (data.url) {
      this.meta.updateTag({ property: 'og:url', content: data.url });
      this.updateCanonicalUrl(data.url);
    }

    if (data.type) {
      this.meta.updateTag({ property: 'og:type', content: data.type });
    }

    // Twitter Card
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });

    // Structured Data
    if (data.structuredData) {
      this.updateStructuredData(data.structuredData);
    }
  }

  /**
   * Met à jour l'URL canonique
   */
  private updateCanonicalUrl(url: string): void {
    if (!this.isBrowser) {
      return;
    }

    let link: HTMLLinkElement | null = document.querySelector('link[rel="canonical"]');
    
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    
    link.setAttribute('href', url);
  }

  /**
   * Met à jour les données structurées JSON-LD
   */
  private updateStructuredData(data: any): void {
    if (!this.isBrowser) {
      return;
    }

    // Supprimer l'ancien script JSON-LD s'il existe
    const existingScript = document.querySelector('script[type="application/ld+json"][data-dynamic="true"]');
    if (existingScript) {
      existingScript.remove();
    }

    // Créer un nouveau script JSON-LD
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-dynamic', 'true');
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
  }

  /**
   * Génère des données structurées pour une collection de partitions
   */
  generateMusicCollectionStructuredData(scores: any[], collectionName: string, description: string): any {
    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': collectionName,
      'description': description,
      'numberOfItems': scores.length,
      'itemListElement': scores.slice(0, 10).map((score, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'item': {
          '@type': 'MusicComposition',
          'name': score.title,
          'composer': {
            '@type': 'Person',
            'name': score.author?.name || 'Unknown'
          },
          'genre': score.genre?.name || 'Unknown',
          'url': `https://pianoml.org/score/${score.slug}`
        }
      }))
    };
  }

  /**
   * Génère des données structurées pour un BreadcrumbList
   */
  generateBreadcrumbStructuredData(items: Array<{ name: string; url: string }>): any {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': items.map((item, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': item.name,
        'item': item.url
      }))
    };
  }
}
