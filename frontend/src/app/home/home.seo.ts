import { currentLocale, localizedUrl, sourceLocale } from '../shared/i18n';
import { SITE, type SeoData, siteUrl } from '../shared/seo';

/** The organization is one entity whatever the page language, identified on the source-language root. */
const organizationId = () => `${localizedUrl('/', sourceLocale().code)}#organization`;

/** The brand, declared once on the site root. */
const organization = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': organizationId(),
  name: SITE.name,
  url: siteUrl('/'),
  logo: `${SITE.url}${SITE.ogImage}`,
  description: SITE.defaultDescription,
  sameAs: ['https://github.com/piano-ml/piano-ml']
});

/**
 * The site itself, with the library search exposed as a SearchAction — this is
 * what a sitelinks search box in the results is built from.
 */
const website = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${localizedUrl('/')}#website`,
  name: SITE.name,
  url: siteUrl('/'),
  publisher: { '@id': organizationId() },
  inLanguage: currentLocale(),
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${siteUrl('/library/popular')}?search={search_term_string}`
    },
    'query-input': 'required name=search_term_string'
  }
});

/**
 * Route data as a function: the URLs inside are built in the current language when the page renders,
 * not when the module loads.
 */
export const homeSeo = (): SeoData => ({
  title: SITE.defaultTitle,
  description: SITE.defaultDescription,
  image: '/assets/images/keyboard.webp',
  canonical: '/',
  structuredData: [organization(), website()]
});

const SUMMARY_DESCRIPTION = $localize`:@@seo.summary.description:Learn piano with interactive exercises, scales, arpeggios and sheet music practice: hands-separated practice, adjustable speed, MIDI support and real-time feedback.`;

export const summarySeo = (): SeoData => ({
  title: $localize`:@@seo.summary.title:Features & Practice Tools`,
  description: SUMMARY_DESCRIPTION,
  image: '/assets/images/keyboard.webp',
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE.name,
    url: siteUrl('/'),
    applicationCategory: 'EducationalApplication',
    description: SUMMARY_DESCRIPTION,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    featureList: [
      $localize`:@@seo.summary.feature.scales:Interactive piano scales generator`,
      $localize`:@@seo.summary.feature.arpeggios:Arpeggios exercises`,
      $localize`:@@seo.summary.feature.generation:Sheet music generation from audio and MIDI`,
      $localize`:@@seo.summary.feature.handsSeparate:Hands-separated practice mode`,
      $localize`:@@seo.summary.feature.speed:Adjustable playback speed`,
      $localize`:@@seo.summary.feature.midi:MIDI keyboard support with real-time feedback`,
      $localize`:@@seo.summary.feature.upload:PDF, MIDI, and MusicXML file upload`,
      $localize`:@@seo.summary.feature.etudes:Collection of digitized piano études`,
      $localize`:@@seo.summary.feature.ml:Machine Learning-powered feedback`
    ],
    about: [
      { '@type': 'Thing', name: $localize`:@@seo.summary.about.education:Piano Education` },
      { '@type': 'Thing', name: $localize`:@@seo.summary.about.theory:Music Theory` },
      { '@type': 'Thing', name: $localize`:@@seo.summary.about.ml:Machine Learning` }
    ]
  }
});
