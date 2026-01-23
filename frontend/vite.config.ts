import { defineConfig } from 'vite';

export default defineConfig({
  ssr: {
    // Ne pas externaliser ces modules CommonJS - les bundler à la place
    noExternal: [
      '@tonejs/midi',
      '@tonejs/piano',
      'tone',
      'opensheetmusicdisplay',
      'vexflow',
      'spessasynth_lib',
      '@stringsync/musicxml',
      'nouislider',
      'wnumb',
      'lodash'
    ]
  },
  optimizeDeps: {
    // Forcer le pré-bundling de ces dépendances CommonJS
    include: [
      '@tonejs/midi',
      '@tonejs/piano', 
      'tone',
      'nouislider',
      'wnumb',
      'lodash'
    ]
  }
});
