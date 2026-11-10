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
| `tests/library_search_test.js` | **Homepage**: "Take a seat", "Legal Notice", "LOGIN". **/summary** (via "Take a seat"): "Start scales exercices" and the four content cards (Library, Exercises, Études for Pianists, Acknowledgments), each with its link and call to action. **/library** (via "Browse library", first-visit tour closed): search box, grade slider, "One hand" / "Two hands" checkboxes, key combo ("All keys"), Import, and the New / Popular / Browse by Genres / Browse by Artist tabs. Then searches "happy birthday" and opens the first result; the score page heading shows its title (the score page itself gets its own scenario). |
| `tests/score_page_test.js` | Opens `/score/hill-mildred-j-happy-birthday-to-you` directly. **Score information**: every value (genre, author, key, grade, duration, tempo, tracks, measures, public domain, uploaded date, owner) asserted next to its own label, plus the MusicBrainz Artist / Work links. **Practice Exercises in this Scale**: the 9 exercise links (exact list and count). **Video lessons**: at least one. Then **Practice** leads to `/work/hill-mildred-j-happy-birthday-to-you`: sheet music rendered, play control shown, page title set. |
| `tests/workbench_test.js` | Opens `/work/hill-mildred-j-happy-birthday-to-you` directly and tortures the player: sheet music and 88-key keyboard rendered, cursor on the first note, measure range 0–17; **tempo** clamped to 200 / 20 (number and slider), +/− buttons; **play** (cursor really advances once the soundfont is loaded, toolbar reduced to play/pause, measure range locked); **pause** (cursor frozen, controls back); **resume** and **play to the end** at 200 BPM (cursor back on the first note); **7 rapid play/pause clicks** end in a consistent state; **clicking the sheet music** toggles playback; on-screen **keys**; **loop / left hand / right hand** toggles; **reset**. Fails on any uncaught JavaScript error. |

## Notes

- The site keeps long-lived requests open, so navigations are considered done at `domcontentloaded`
  (see `codecept.conf.js`); steps wait for visible elements instead.
- Keep scenario titles short: CodeceptJS names trace and screenshot files after them.
- These tests run against production data: assert on stable behaviour, not on exact catalogue contents.
- `I.see()` matches the text as displayed: CSS `text-transform` applies (the header shows "LOGIN").
- Angular renders `routerLink="/exercises/"` as `href="/exercises"`: assert on rendered hrefs.
- The browser runs with locale `en-US` and timezone `UTC` (`emulate` in `codecept.conf.js`) so rendered dates are
  the same locally and in CI.
- The score page scenario asserts exact production values (grade, upload date, exercise list…). If one of
  them is legitimately changed on the site, update the expected value in the test.
- `locate().at()` builds XPath, which does not match SVG elements (piano keys): use a Playwright locator,
  `{ pw: '#keyboard svg rect >> nth=39' }`.
- The workbench downloads a 6.6 MB soundfont on the first play, then counts in two bars: wait for the cursor to
  move rather than for a fixed delay.
- Known production issues seen by the workbench scenario (not asserted, so the suite stays green): typing an
  out-of-range tempo when the tempo is already clamped leaves the typed value in the field; the measure range
  stays locked after the score plays to its end; `/styles.css` is preloaded but returns 404.
- `locate().inside()` mis-combines containers whose XPath uses `following-sibling`: write descendant XPaths
  explicitly (see `linkIn` in `score_page_test.js`).
