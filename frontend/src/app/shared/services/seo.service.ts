import { Injectable, inject, PLATFORM_ID, Inject, DOCUMENT } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { isPlatformBrowser } from '@angular/common';
import type { ScoreApiInfo } from '../../core/api';

export interface MusicCompositionSeoOptions {
  /** URL canonique de la page partition */
  url: string;
  /** Origine du site, sans slash final */
  siteUrl: string;
  image?: string;
  /** Nom de genre résolu, sinon celui porté par la partition */
  genreName?: string;
}

/**
 * L'API renvoie des auteurs conventionnels entre crochets ("[traditional]").
 * On les rend présentables pour un titre de page ou un nom de compositeur.
 */
export function displayAuthorName(author?: string | null): string {
  const name = (author || '').replace(/\s+/g, ' ').trim();

  if (!name) {
    return 'Unknown composer';
  }

  const unbracketed = name.replace(/^\[(.*)\]$/, '$1').trim();
  if (!unbracketed) {
    return 'Unknown composer';
  }

  // "traditional" -> "Traditional", mais on ne touche pas aux noms déjà capitalisés
  return unbracketed === unbracketed.toLowerCase()
    ? unbracketed.charAt(0).toUpperCase() + unbracketed.slice(1)
    : unbracketed;
}

/**
 * Convertit une durée en secondes vers le format ISO 8601 attendu par schema.org
 */
export function toIso8601Duration(seconds?: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `PT${minutes ? `${minutes}M` : ''}${remainder ? `${remainder}S` : ''}`;
}

export interface SeoData {
  title?: string;
  /** Texte complet : le service le normalise et le tronque par balise */
  description?: string;
  keywords?: string;
  image?: string;
  imageAlt?: string;
  url?: string;
  type?: string;
  siteName?: string;
  locale?: string;
  /** Un objet JSON-LD, ou plusieurs (un bloc <script> par entrée) */
  structuredData?: any;
}

/** Google tronque l'extrait autour de 160 caractères */
const META_DESCRIPTION_MAX = 160;
/** Les aperçus Open Graph / Twitter tronquent autour de 200 caractères */
const OG_DESCRIPTION_MAX = 200;

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private meta = inject(Meta);
  private titleService = inject(Title);
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);
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

    // Description : le texte brut de l'API contient des sauts de ligne et dépasse
    // largement ce que les moteurs et les aperçus affichent, on normalise et tronque.
    const description = this.normalizeText(data.description);
    if (description) {
      this.meta.updateTag({ name: 'description', content: this.truncate(description, META_DESCRIPTION_MAX) });

      const socialDescription = this.truncate(description, OG_DESCRIPTION_MAX);
      this.meta.updateTag({ property: 'og:description', content: socialDescription });
      this.meta.updateTag({ name: 'twitter:description', content: socialDescription });
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

      const imageAlt = this.normalizeText(data.imageAlt) || this.normalizeText(data.title);
      if (imageAlt) {
        this.meta.updateTag({ property: 'og:image:alt', content: imageAlt });
        this.meta.updateTag({ name: 'twitter:image:alt', content: imageAlt });
      }
    }

    if (data.url) {
      this.meta.updateTag({ property: 'og:url', content: data.url });
      this.updateCanonicalUrl(data.url);
    }

    if (data.type) {
      this.meta.updateTag({ property: 'og:type', content: data.type });
    }

    // Identité du site (constante, mais requise sur chaque page par les crawlers sociaux)
    this.meta.updateTag({ property: 'og:site_name', content: data.siteName || 'PianoML' });
    this.meta.updateTag({ property: 'og:locale', content: data.locale || 'en_US' });

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
    let link: HTMLLinkElement | null = this.document.querySelector('link[rel="canonical"]');
    
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    
    link.setAttribute('href', url);
  }

  /**
   * Normalise un texte libre en une seule ligne exploitable dans un attribut meta
   */
  private normalizeText(text?: string | null): string {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Tronque sur une frontière de mot, sans couper au milieu d'un mot
   */
  private truncate(text: string, max: number): string {
    if (text.length <= max) {
      return text;
    }

    const slice = text.slice(0, max - 1);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
    return `${cut.replace(/[\s,;:.–—-]+$/, '')}…`;
  }

  /**
   * Met à jour les données structurées JSON-LD (un ou plusieurs blocs)
   */
  private updateStructuredData(data: any): void {
    // Supprimer les anciens scripts JSON-LD s'ils existent
    const existingScripts = this.document.querySelectorAll('script[type="application/ld+json"][data-dynamic="true"]');
    existingScripts.forEach(script => script.remove());

    const blocks = Array.isArray(data) ? data : [data];

    for (const block of blocks) {
      if (!block) {
        continue;
      }

      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-dynamic', 'true');
      // Les sérialiseurs HTML n'échappent pas le contenu d'un <script> : neutraliser
      // les "<" évite qu'un "</script>" présent dans les données ne casse la page.
      script.text = JSON.stringify(block).replace(/</g, '\\u003c');
      this.document.head.appendChild(script);
    }
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
   * Génère des données structurées MusicComposition pour une partition,
   * à partir des champs renvoyés par l'API score.
   */
  generateMusicCompositionStructuredData(score: ScoreApiInfo, options: MusicCompositionSeoOptions): any {
    const composerName = displayAuthorName(score.author);
    const genreName = this.normalizeText(options.genreName || score.genre);
    const description = this.normalizeText(score.description);

    const composer: any = {
      '@type': 'Person',
      'name': composerName
    };
    if (score.author_mbid) {
      composer.sameAs = `https://musicbrainz.org/artist/${score.author_mbid}`;
    }
    if (score.author_slug) {
      composer.url = `${options.siteUrl}/library/artists/${score.author_slug}`;
    }

    const data: any = {
      '@context': 'https://schema.org',
      '@type': 'MusicComposition',
      'name': this.normalizeText(score.title) || 'Untitled',
      'url': options.url,
      'composer': composer
    };

    if (description) {
      data.description = description;
    }
    if (genreName) {
      data.genre = genreName;
    }
    if (score.fullKey) {
      data.musicalKey = score.fullKey;
    }
    if (options.image) {
      data.image = options.image;
    }
    // inLanguage décrit la langue des paroles : sans paroles, la propriété n'a pas de sens.
    if (score.has_lyrics) {
      data.inLanguage = 'en';
    }
    if (score.mbid) {
      data.sameAs = `https://musicbrainz.org/work/${score.mbid}`;
    }
    if (score.publicDomain) {
      data.isAccessibleForFree = true;
      data.license = 'https://creativecommons.org/publicdomain/mark/1.0/';
    }
    if (score.playCount) {
      data.interactionStatistic = {
        '@type': 'InteractionCounter',
        'interactionType': 'https://schema.org/ListenAction',
        'userInteractionCount': score.playCount
      };
    }

    // La partition jouable sur le site est une interprétation de l'œuvre :
    // c'est elle qui porte la durée, pas la composition.
    if (score.has_files && score.immutableSlug) {
      const recording: any = {
        '@type': 'MusicRecording',
        'name': data.name,
        'url': `${options.siteUrl}/work/${score.immutableSlug}`
      };
      const duration = toIso8601Duration(score.duration);
      if (duration) {
        recording.duration = duration;
      }
      data.recordedAs = recording;
    }

    return data;
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
