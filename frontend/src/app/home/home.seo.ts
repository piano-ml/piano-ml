import { SITE, type SeoData } from '../shared/seo';

/** The brand, declared once on the site root. */
const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE.url}/#organization`,
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}${SITE.ogImage}`,
  description: SITE.defaultDescription,
  sameAs: ['https://github.com/piano-ml/piano-ml']
};

/**
 * The site itself, with the library search exposed as a SearchAction — this is
 * what a sitelinks search box in the results is built from.
 */
const WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE.url}/#website`,
  name: SITE.name,
  url: SITE.url,
  publisher: { '@id': `${SITE.url}/#organization` },
  inLanguage: 'en',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE.url}/library/popular?search={search_term_string}`
    },
    'query-input': 'required name=search_term_string'
  }
};

export const HOME_SEO: SeoData = {
  title: SITE.defaultTitle,
  description: SITE.defaultDescription,
  image: '/assets/images/keyboard.webp',
  canonical: '/',
  structuredData: [ORGANIZATION, WEBSITE]
};

const SUMMARY_DESCRIPTION =
  'Learn piano with interactive exercises, scales, arpeggios and sheet music practice: hands-separated practice, adjustable speed, MIDI support and real-time feedback.';

export const SUMMARY_SEO: SeoData = {
  title: 'Features & Practice Tools',
  description: SUMMARY_DESCRIPTION,
  image: '/assets/images/keyboard.webp',
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE.name,
    url: SITE.url,
    applicationCategory: 'EducationalApplication',
    description: SUMMARY_DESCRIPTION,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    featureList: [
      'Interactive piano scales generator',
      'Arpeggios exercises',
      'Sheet music generation from audio and MIDI',
      'Hands-separated practice mode',
      'Adjustable playback speed',
      'MIDI keyboard support with real-time feedback',
      'PDF, MIDI, and MusicXML file upload',
      'Collection of digitized piano études',
      'Machine Learning-powered feedback'
    ],
    about: [
      { '@type': 'Thing', name: 'Piano Education' },
      { '@type': 'Thing', name: 'Music Theory' },
      { '@type': 'Thing', name: 'Machine Learning' }
    ]
  }
};
