import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    fs: {
      // Permettre de servir des fichiers en dehors de la racine si nécessaire
      strict: false
    }
  },
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
      'spessasynth_lib',
      'nouislider',
      'wnumb',
      'lodash'
    ],
    esbuildOptions: {
      // Désactiver les source maps pour éviter les avertissements DevTools sur le WASM de spessasynth
      sourcemap: false
    }
  }
});
