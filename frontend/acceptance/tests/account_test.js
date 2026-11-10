import path from 'node:path';
import { fileURLToPath } from 'node:url';

Feature('Account');

// Dedicated acceptance account. Each run starts fresh: a leftover account (from a run that failed midway) is
// deleted first, then the account is created, used and deleted at the end. Override with env vars if needed.
const USER = {
  name: process.env.ACCEPTANCE_NAME || 'acceptance-test',
  email: process.env.ACCEPTANCE_EMAIL || 'acceptance-test@example.com',
  password: process.env.ACCEPTANCE_PASSWORD || 'Acceptance-Test-2026',
};
// Artist for the imported score: one already known to PianoML, so the backend finds it by MusicBrainz id instead
// of fetching it from MusicBrainz (that server-side lookup can fail on production: "MusicBrainz returned no
// author for mbid ..."). Title is a dummy one.
const ARTIST_QUERY = process.env.ACCEPTANCE_ARTIST || 'Mildred J. Hill';
const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/scripts/samples');
// Two scores: the MusicXML one stays until the account is deleted, the MIDI one is deleted on its own.
const MUSICXML = { title: 'test', file: path.join(SAMPLES, 'src_test.musicxml') };
const MIDI = { title: 'test midi', file: path.join(SAMPLES, 'src_test.midi') };
// Note: the MIDI import runs MuseScore + automatic fingering inside the upload request. On production's small
// backend (2 instances, 1 vCPU) it saturated every instance on 2026-11-10 (site answered 429 for ~10 minutes).

/** Submits the login form; resolves to true when logged in, false when the credentials were refused. */
async function login(I) {
  I.amOnPage('/account/login');
  I.waitForElement('#email');
  I.fillField('#email', USER.email);
  I.fillField('#password', USER.password);
  I.click(locate('button').withAttr({ type: 'submit' }));
  I.waitForFunction(
    () => location.pathname !== '/account/login' || document.body.innerText.includes('Access denied'),
    15,
  );
  return !(await I.grabCurrentUrl()).includes('/account/login');
}

/**
 * Runs a MusicBrainz-backed search until results show. The browser queries musicbrainz.org directly, which
 * answers 503 when called more than about once per second: dismiss the error and search again, like a user.
 */
async function searchMusicBrainz(I, results, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    I.click(locate('button').withText('Search'));
    I.waitForFunction(
      ([xpath]) => !!document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
        || document.body.innerText.includes('Error occurred'),
      [results],
      20,
    );
    if ((await I.grabNumberOfVisibleElements('//*[normalize-space() = "Error occurred"]')) === 0) return;
    I.click(locate('button').withText('Dismiss'));
    I.wait(2 * attempt);
  }
  throw new Error(`MusicBrainz search still failing after ${attempts} attempts`);
}

/** Closes the workbench guided tour if it shows up (it only opens on the first visit). */
async function closeTourIfShown(I, seconds = 5) {
  const shown = await I.executeScript(timeout => new Promise(resolve => {
    const started = Date.now();
    const poll = () => {
      if (document.querySelector('.beacon-tooltip')) return resolve(true);
      if (Date.now() - started > timeout) return resolve(false);
      setTimeout(poll, 200);
    };
    poll();
  }), seconds * 1000);
  if (shown) {
    I.click(locate('button').withAttr({ 'aria-label': 'Close' }));
    I.waitForInvisible('.beacon-tooltip', 5);
  }
}

/**
 * From My Scores: Import -> work search -> manual creation (first artist matching ARTIST_QUERY, given title) ->
 * upload. MusicXML uploads as soon as the file is chosen; MIDI shows its tracks first and needs "load".
 * Ends on the new score page; returns the artist name.
 */
async function importScore(I, { title, file }) {
  I.click(locate('a').withText('Import'));
  I.waitInUrl('/import/link');
  I.waitForText('Quick Search: select a work to define a title and author');
  I.fillField(locate('input').withAttr({ placeholder: "Search for works (e.g., 'redemption song')" }), title);
  const manualCreation = "Can't find the work you're looking for in the database? Create it manually";
  await searchMusicBrainz(I, `//button[normalize-space() = "${manualCreation}"]`);
  I.click(manualCreation);
  I.waitForText('Search for an artist');
  I.fillField(locate('input').withAttr({ placeholder: "Enter artist name (e.g., 'Bob Marley')" }), ARTIST_QUERY);
  I.wait(1.5); // MusicBrainz rate limit: about one request per second
  const firstArtist = { xpath: '(//table[.//th[normalize-space() = "Country"]]//tr[td])[1]' };
  await searchMusicBrainz(I, firstArtist.xpath);
  const artistName = (await I.grabTextFrom({ xpath: `${firstArtist.xpath}/td[1]` })).trim().split('\n')[0];
  I.click({ xpath: `${firstArtist.xpath}//button` });
  I.waitForText('Enter the work title');
  I.fillField(locate('input').withAttr({ placeholder: 'Enter work/song title' }), title);
  I.click('Create Work');
  // The upload page opens with skipLocationChange: the URL stays /import/link
  I.waitForText('Please select a file to import', 10);
  I.see('Enable automatic fingering');

  // The file input is hidden behind the drop zone: set it through Playwright (I.attachFile wants it visible)
  await I.usePlaywrightTo(`choose ${path.basename(file)}`, async ({ page }) => {
    await page.setInputFiles('#dropzone-file', file);
  });
  if (file.endsWith('.midi') || file.endsWith('.mid')) {
    // MIDI: the tracks are listed (study tracks pre-selected), then "load" creates the score
    I.waitForElement(locate('th').withText('Track Name'), 15);
    I.seeElement(locate('table tbody tr').withDescendant('input[type="checkbox"]'));
    I.click(locate('button').withText('load'));
  }
  I.waitInUrl('/score/', 90); // score created, file packed on the backend
  I.waitForText(title, 30, 'h1');
  I.see(artistName, 'h1');
  return artistName;
}

/** Account page -> My Scores (from any page with the site header). */
function goToMyScores(I) {
  I.click(locate('a.user-link').withText(USER.name));
  I.waitInUrl('/account/home');
  I.click(locate('a').withText('My Scores'));
  I.waitInUrl('/account/scores');
  I.waitForText('Your uploaded and curated collection');
}

/** My Scores row for a score (the title is matched exactly: "test" must not match "test midi"). */
const scoreRow = (title, artistName) => ({
  xpath: `//table//tbody//tr[td[normalize-space() = "${title}"]][contains(., "${artistName}")]`,
});

/**
 * On a score page: Practice -> the sheet music renders and the cursor advances on play; pause, then back to the
 * score page through the workbench info button (the workbench has no site header).
 */
async function checkPlayable(I, title) {
  I.click(locate('button').withText('Practice'));
  I.waitInUrl('/work/');
  // Sheet music rendered. Generous: a freshly imported score's files are fetched cold, and production may be busy
  I.waitForElement('#osmdSvgPage1', 60);
  await closeTourIfShown(I);
  const before = await I.executeScript(() => {
    const c = document.getElementById('cursorImg-0');
    return c ? { left: c.style.left, top: c.style.top } : null;
  });
  I.click('#play-pause button');
  I.waitForElement('#play-pause ng-icon[name="bootstrapPauseFill"]', 5);
  // Playable: the cursor moves once the soundfont is loaded and the count-in is over
  I.waitForFunction(
    ([left, top]) => {
      const c = document.getElementById('cursorImg-0');
      return !!c && (c.style.left !== left || c.style.top !== top);
    },
    [before?.left ?? '', before?.top ?? ''],
    30,
  );
  I.click('#play-pause button');
  I.waitForElement('#play-pause ng-icon[name="bootstrapPlayFill"]', 5);
  I.click('#score-info');
  I.waitInUrl('/score/');
  I.waitForText(title, 15, 'h1');
}

/** On a score page the user owns: Edit -> Delete -> confirmation; lands on My Scores. */
function deleteOpenScore(I) {
  // Edit only shows once the score has loaded and its owner is known
  I.waitForElement(locate('button').withText('Edit'), 30);
  I.click(locate('button').withText('Edit'));
  I.waitInUrl('/account/score/edit/');
  I.click(locate('button').withText('Delete'));
  I.waitForText('Confirm delete', 5);
  I.see('This action cannot be undone. Are you sure?');
  I.click(locate('.modal button').withText('Delete'));
  I.waitInUrl('/account/scores', 15);
  I.waitForText('Your uploaded and curated collection');
}

const MY_SCORES_ROWS = '//table//tbody//tr[td]';
const MY_SCORES_EMPTY = 'No scores yet — upload your first MIDI file to get started.';

/** Number of scores listed in My Scores, once the list has loaded (rows or the empty message). */
async function countMyScores(I) {
  I.waitForFunction(
    ([rows, empty]) => !!document.evaluate(rows, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
      || document.body.innerText.includes(empty),
    [MY_SCORES_ROWS, MY_SCORES_EMPTY],
    15,
  );
  return I.grabNumberOfVisibleElements(MY_SCORES_ROWS);
}

/** Deletes every score listed in My Scores, one by one, until the list is empty. */
async function deleteAllMyScores(I) {
  goToMyScores(I);
  let remaining = await countMyScores(I);
  for (let guard = 0; remaining > 0; guard++) {
    if (guard >= 20) throw new Error(`My Scores still lists ${remaining} score(s) after 20 deletions`);
    const title = (await I.grabTextFrom({ xpath: `(${MY_SCORES_ROWS})[1]/td[normalize-space()][1]` })).trim();
    I.click({ xpath: `(${MY_SCORES_ROWS})[1]` });
    I.waitInUrl('/score/');
    deleteOpenScore(I);
    const after = await countMyScores(I);
    if (after !== remaining - 1) throw new Error(`deleting "${title}" left ${after} score(s), expected ${remaining - 1}`);
    remaining = after;
  }
  I.see(MY_SCORES_EMPTY);
  I.dontSee('1 score');
}

/**
 * Deletes the logged-in account from its account page (reached through the header link, as a user would), then
 * checks the same credentials are refused.
 */
async function deleteAccount(I) {
  I.click(locate('a.user-link').withText(USER.name));
  I.waitInUrl('/account/home');
  I.waitForElement(locate('button').withText('Delete account'), 15);
  I.click(locate('button').withText('Delete account'));
  I.waitForElement('[role="dialog"]');
  I.see('This action cannot be undone', '[role="dialog"]');
  I.click(locate('button').withText('Delete my account'));
  I.waitInUrl('/account/login', 15);
  if (await login(I)) throw new Error('the deleted account can still log in');
  I.see('Access denied - Please check your credentials');
}

Scenario('log in or sign up, inspect the account, import a score, delete the account', async ({ I }) => {
  // --- Start from a fresh account: a leftover one (from a run that failed midway) is deleted first ---------------
  if (await login(I)) {
    I.waitForElement(locate('a.user-link').withText(USER.name), 15);
    await deleteAccount(I);
  } else {
    I.see('Access denied - Please check your credentials');
  }

  // --- Create the account, then log in -----------------------------------------------------------------------
  {
    I.click("Don't have an account? Create one");
    I.waitInUrl('/account/create');
    I.fillField('#name', USER.name);
    I.fillField('#email', USER.email);
    I.fillField('#password', USER.password);
    I.fillField('#confirmPassword', USER.password);
    I.click('Create Account');
    I.waitInUrl('/account/login');
    const loggedIn = await login(I);
    if (!loggedIn) throw new Error('login failed right after creating the account');
  }

  // --- Logged in: the header shows the user name, which leads to the account page ---------------------------
  I.waitForElement(locate('a.user-link').withText(USER.name), 15);
  I.dontSeeElement('a.login-btn');
  I.click(locate('a.user-link').withText(USER.name));
  I.waitInUrl('/account/home');

  // --- Account page ---------------------------------------------------------------------------------------------
  I.waitForText('Profile');
  I.see('Account settings & workbench preferences');
  I.waitForText(USER.email);
  // Section and field labels are rendered upper-case by CSS
  I.see('IDENTITY');
  I.see('NAME');
  I.see(USER.name);
  I.see('WORKBENCH');
  I.see('MIDI Setup →');
  // Default workbench preferences, each value next to its label (labels matched on their DOM text)
  for (const [label, value] of [['MIDI lowest key', '21'], ['MIDI highest key', '108'],
    ['Draw fingering', 'Yes'], ['Draw lyrics', 'Yes'], ['Show keyboard', 'Yes']]) {
    I.see(label.toUpperCase());
    I.see(value, locate('div').withChild(locate('p.field-label').withText(label)));
  }
  I.seeElement(locate('a').withText('My Scores'));
  I.seeElement(locate('button').withText('Logout'));

  // --- My Scores ------------------------------------------------------------------------------------------------
  I.click(locate('a').withText('My Scores'));
  I.waitInUrl('/account/scores');
  I.waitForText('Your uploaded and curated collection');
  I.seeElement(locate('button').withText('Browse library'));

  // --- First score: MusicXML, listed in My Scores and playable --------------------------------------------------------
  const musicxmlArtist = await importScore(I, MUSICXML);
  goToMyScores(I);
  I.waitForElement(scoreRow(MUSICXML.title, musicxmlArtist), 15);
  I.see('1 score'); // the account owns exactly this score
  I.click(scoreRow(MUSICXML.title, musicxmlArtist));
  I.waitInUrl('/score/');
  I.waitForText(MUSICXML.title, 15, 'h1');
  await checkPlayable(I, MUSICXML.title);

  // --- Second score: MIDI, playable, then deleted -------------------------------------------------------------------------
  goToMyScores(I);
  const midiArtist = await importScore(I, MIDI);
  goToMyScores(I);
  I.waitForElement(scoreRow(MIDI.title, midiArtist), 15);
  I.seeElement(scoreRow(MUSICXML.title, musicxmlArtist));
  I.see('2 scores');
  I.click(scoreRow(MIDI.title, midiArtist));
  I.waitInUrl('/score/');
  I.waitForText(MIDI.title, 15, 'h1');
  await checkPlayable(I, MIDI.title);

  // Delete it: owner-only Edit -> Delete -> confirmation -> back to My Scores without it
  deleteOpenScore(I);
  I.waitForElement(scoreRow(MUSICXML.title, musicxmlArtist), 15);
  I.dontSeeElement(scoreRow(MIDI.title, midiArtist));
  I.see('1 score');

  // --- Delete every score left in My Scores ------------------------------------------------------------------------------
  await deleteAllMyScores(I);

  // --- Delete the account, so the next run starts from scratch ---------------------------------------------------------
  await deleteAccount(I);
});
