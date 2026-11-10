# PianoML acceptance tests

End-to-end tests written with [CodeceptJS](https://codecept.io) (Playwright helper), run against a deployed site.
They drive a real browser the way a visitor does: links, buttons and forms, no API shortcuts.

This folder is its own npm project, so the test tooling never ends up in the Angular app's dependencies.

## Run

```bash
cd frontend/acceptance
npm ci
npm run install:browser   # once: Playwright Chromium (+ system deps)
npm test                  # headless, against https://pianoml.org
```

| Option | Example |
|---|---|
| Another site | `BASE_URL=https://staging.pianoml.org npm test` |
| Watch the browser | `npm run test:headed` |

From `frontend/`: `npm run acceptance`.

On failure, a screenshot and a Playwright trace (`npx playwright show-trace <file>`) are written to `output/`.

## Scenarios

| File | What it checks |
|---|---|
| `tests/library_search_test.js` | Homepage → "Take a seat" → "Browse library" → close the first-visit tour → search "happy birthday" → open the first result; the score page heading shows that result's title. |

## Notes

- The site keeps long-lived requests open, so navigations are considered done at `domcontentloaded`
  (see `codecept.conf.js`); steps wait for visible elements instead.
- Keep scenario titles short: CodeceptJS names trace and screenshot files after them.
- These tests run against production data: assert on stable behaviour, not on exact catalogue contents.
