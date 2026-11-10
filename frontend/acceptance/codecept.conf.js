// CodeceptJS configuration for PianoML acceptance tests.
//
//   npm test                         -> headless, against https://pianoml.org
//   BASE_URL=https://staging.pianoml.org npm test
//   npm run test:headed              -> watch the browser
export const config = {
  name: 'pianoml-acceptance',
  tests: './tests/**/*_test.js',
  output: './output',
  helpers: {
    Playwright: {
      url: process.env.BASE_URL || 'https://pianoml.org',
      browser: 'chromium',
      show: process.env.HEADLESS === 'false',
      windowSize: '1366x900',
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
