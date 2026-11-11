// CodeceptJS configuration for PianoML acceptance tests.
//
//   npm test                         -> headless, against https://pianoml.org
//   BASE_URL=https://staging.pianoml.org npm test
//   npm run test:headed              -> watch the browser
//   SITE_ADDRESS=127.0.0.1 npm test  -> the site's host (pianoml.org) resolves to 127.0.0.1, its certificate is not
//                                       checked: CI serves the frontend image there (self-signed TLS) under the real
//                                       origin, so the production API (api.pianoml.org, resolved normally) accepts it.
const BASE_URL = process.env.BASE_URL || 'https://pianoml.org';
const SITE_ADDRESS = process.env.SITE_ADDRESS;

export const config = {
  name: 'pianoml-acceptance',
  tests: './tests/**/*_test.js',
  output: './output',
  helpers: {
    Playwright: {
      url: BASE_URL,
      browser: 'chromium',
      ...(SITE_ADDRESS && {
        // Only this exact host: subdomains such as api.pianoml.org still resolve to the real servers.
        chromium: { args: [`--host-resolver-rules=MAP ${new URL(BASE_URL).hostname} ${SITE_ADDRESS}`] },
        ignoreHTTPSErrors: true,
      }),
      show: process.env.HEADLESS === 'false',
      windowSize: '1366x900',
      // Same rendering everywhere (dates in "Score information" depend on locale and timezone).
      emulate: { locale: 'en-US', timezoneId: 'UTC' },
      // The site keeps long-lived requests open, so the "load" event can take very long:
      // consider a navigation done at DOMContentLoaded and wait for visible elements instead.
      waitForNavigation: 'domcontentloaded',
      waitForTimeout: 15000,
      timeout: 15000,
      trace: true,
      keepTraceForPassedTests: false,
    },
  },
  plugins: {
    screenshotOnFail: { enabled: true },
  },
};
