import { SITE, type SeoData } from '../shared/seo';

export const HOME_SEO: SeoData = {
  title: SITE.defaultTitle,
  description: SITE.defaultDescription,
  image: '/assets/images/keyboard.webp',
  canonical: '/'
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
