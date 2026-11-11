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

## Running against localhost

The suite targets any URL through `BASE_URL`. Locally, the frontend is always served by the Angular dev server
(`npm start` in `frontend/`), whose proxy (`proxy.conf.mjs`) forwards `/api` to a backend; the tests only talk to
`http://localhost:4200`.

```bash
# terminal 1: frontend dev server (http://localhost:4200)
cd frontend && npm start                                    # API = production (https://api.pianoml.org)
cd frontend && API_TARGET=http://localhost:8080 npm start   # API = local backend

# terminal 2: the tests (wait until the dev server has finished its first build)
cd frontend/acceptance && BASE_URL=http://localhost:4200 npm test
BASE_URL=http://localhost:4200 npx codeceptjs run tests/workbench_test.js   # one scenario (one file per run)
```

Use `npm run start -- --host 127.0.0.1` and `BASE_URL=http://127.0.0.1:4200` to test on `127.0.0.1`.

### Which backend for which scenario

| Scenario | Local frontend + **production API** | Local frontend + **local backend** |
|---|---|---|
| `library_search`, `score_page`, `workbench` | ✅ read-only; tests your local frontend against real data | needs the production catalogue (the "Happy Birthday to You" scores, ~12 000 scores): an empty database fails these scenarios |
| `account` | ⚠️ **writes to production**: creates and deletes the acceptance account, uploads two scores. The MIDI import can saturate production's backend (it did on 2026-11-10) | ✅ the intended target for this scenario |

Verified on 2026-11-10: `library_search`, `score_page` and `workbench` pass against a local frontend
(`npm start`, production API).

### Local backend

`docker compose up` (repository root) starts the backend on `:8080` and Postgres; Liquibase creates the schema
(including the `junk` system user) on start. The backend image ships MuseScore 3 and pianoplayer, which imports
need. Imports also store files in S3-compatible storage: configure a **development** bucket (or a local MinIO)
through `spring.cloud.aws.endpoint`, `aws.s3.bucket-name` and the AWS credentials. The defaults point at the
production bucket. The account scenario's artist ("Mildred J. Hill") is then fetched from MusicBrainz by the local
backend, since a fresh database does not know it yet.

## Scenarios

| File | What it checks |
|---|---|
| `tests/library_search_test.js` | **Homepage**: "Take a seat", "Legal Notice", "LOGIN". **/summary** (via "Take a seat"): "Start scales exercices" and the four content cards (Library, Exercises, Études for Pianists, Acknowledgments), each with its link and call to action. **/library** (via "Browse library", first-visit tour closed): search box, grade slider, "One hand" / "Two hands" checkboxes, key combo ("All keys"), Import, and the New / Popular / Browse by Genres / Browse by Artist tabs. Then searches "happy birthday" and opens the first result; the score page heading shows its title (the score page itself gets its own scenario). |
| `tests/score_page_test.js` | Opens `/score/hill-mildred-j-happy-birthday-to-you` directly. **Score information**: every value (genre, author, key, grade, duration, tempo, tracks, measures, public domain, uploaded date, owner) asserted next to its own label, plus the MusicBrainz Artist / Work links. **Practice Exercises in this Scale**: the 9 exercise links (exact list and count). **Video lessons**: at least one. Then **Practice** leads to `/work/hill-mildred-j-happy-birthday-to-you`: sheet music rendered, play control shown, page title set. |
| `tests/workbench_test.js` | Opens `/work/hill-mildred-j-happy-birthday-to-you` directly and tortures the player: sheet music and 88-key keyboard rendered, cursor on the first note, measure range 0–17; **tempo** clamped to 200 / 20 (number and slider), +/− buttons; **play** (cursor really advances once the soundfont is loaded, toolbar reduced to play/pause, measure range locked); **pause** (cursor frozen, controls back); **resume** and **play to the end** at 200 BPM (cursor back on the first note); **7 rapid play/pause clicks** end in a consistent state; **clicking the sheet music** toggles playback; on-screen **keys**; **loop / left hand / right hand** toggles; **reset**. Fails on any uncaught JavaScript error. |
| `tests/account_test.js` | Starts from a fresh **account**: deletes a leftover one (from a run that failed midway), then **creates** it and logs in. Account page (email, name, default workbench preferences), **My Scores**, **Import** → work search → manual creation (first artist matching "Mildred J. Hill") → uploads **`src_test.musicxml`** as "test": listed in My Scores ("1 score"), opens, **Practice** plays (cursor advances). Then imports **`src_test.midi`** as "test midi" (tracks listed, "load"): listed ("2 scores"), playable, then **deleted** through Edit → Delete → confirmation ("1 score" again). Just before the end, **deletes every score left in My Scores** (each one opened, Edit → Delete → confirmation) until the list shows its empty message. Then checks that **login brings you back**: a deliberate logout leads to plain login (no `returnUrl`); from `/score/hill-mildred-j-happy-birthday-to-you` the header **LOGIN** button opens `/account/login?returnUrl=<score page>`, the "Create one" link keeps it, and logging in lands on **the same score page**, logged in; a crafted `returnUrl=https://example.org/…` is ignored (login stays on the homepage). Finally **deletes the account** and checks the same credentials are refused. |

## Account scenario

Credentials default to a dedicated account (`acceptance-test@example.com`); override with `ACCEPTANCE_NAME`,
`ACCEPTANCE_EMAIL`, `ACCEPTANCE_PASSWORD` and `ACCEPTANCE_ARTIST`. Every run creates the account and deletes it at
the end (a leftover from a failed run is deleted first), so it always owns exactly the score it uploads. Deleted
accounts' scores go to the "junk" system user.

## Notes

- A score whose import failed midway (created, but its files never produced) never finishes loading
  ("Loading score…"), so it can neither be opened nor deleted from the UI. The account scenario's start-of-run
  cleanup deletes a leftover account directly (its scores go to the "junk" user), so such a score does not block
  later runs.

- The account scenario's MIDI import runs MuseScore + automatic fingering inside the upload request. On
  production's backend (max 2 instances, 1 vCPU) one such import saturated every instance on 2026-11-10 and the
  whole site answered 429 for about 10 minutes. Prefer a local backend for this scenario.

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
- Out-of-range tempo values are clamped when the field is committed: the workbench scenario presses Tab after
  typing, like a user leaving the field.
- MusicBrainz is queried from the browser and answers 503 above about one request per second: the account
  scenario dismisses the error and searches again (up to 3 attempts).
- The import uses an artist already known to PianoML ("Mildred J. Hill"): for artists not yet in PianoML,
  production answers `POST /score` with 404 "MusicBrainz returned no author for mbid …" (the backend's own
  MusicBrainz lookup fails), so a random artist would make the scenario fail for a reason outside the UI.
- The workbench has no site header: the scenario goes back to the score page through its info button.
- `I.waitForFunction(fn, args, seconds)` passes `args` to `fn` as **one array**: write `([a, b]) => …`, not
  `(a, b) => …` (the latter silently receives the whole array in `a`).
- `locate().inside()` mis-combines containers whose XPath uses `following-sibling`: write descendant XPaths
  explicitly (see `linkIn` in `score_page_test.js`).
