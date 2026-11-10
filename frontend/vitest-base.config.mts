import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// spessasynth_core depends on fflate. The test bundler resolves packages with
// both the "browser" and "node" conditions, and fflate lists "node" first, so
// it picks the Node-only build (which calls module.createRequire). The unit
// tests run in a real browser, so force fflate's browser build, as the
// production build does.
export default defineConfig({
  resolve: {
    alias: {
      fflate: fileURLToPath(new URL('./node_modules/fflate/esm/browser.js', import.meta.url))
    }
  }
});
