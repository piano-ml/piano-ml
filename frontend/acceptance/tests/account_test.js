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
const TITLE = 'test';
const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/scripts/samples/src_test.musicxml');

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
      xpath => !!document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
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

/**
 * Deletes the logged-in account from its account page (reached through the header link: a full reload of
 * /account/home while logged in currently redirects to /account/login, server-side rendering does not see the
 * session kept in localStorage), then checks the same credentials are refused.
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

  // --- Import: work search, then manual creation (first artist matching ARTIST_QUERY, title TITLE) ------------------
  I.click(locate('a').withText('Import'));
  I.waitInUrl('/import/link');
  I.waitForText('Quick Search: select a work to define a title and author');
  I.fillField(locate('input').withAttr({ placeholder: "Search for works (e.g., 'redemption song')" }), 'test');
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
  I.fillField(locate('input').withAttr({ placeholder: 'Enter work/song title' }), TITLE);
  I.click('Create Work');
  // The upload page opens with skipLocationChange: the URL stays /import/link
  I.waitForText('Please select a file to import', 10);
  I.see('Enable automatic fingering');

  // --- Upload the MusicXML sample: choosing a MusicXML file uploads it straight away -----------------------------------
  // The file input is hidden behind the drop zone: set it through Playwright (I.attachFile wants it visible)
  await I.usePlaywrightTo('choose the MusicXML file', async ({ page }) => {
    await page.setInputFiles('#dropzone-file', SAMPLE);
  });
  I.waitInUrl('/score/', 90); // score created, file packed on the backend
  I.waitForText(TITLE, 30, 'h1');
  I.see(artistName, 'h1');

  // --- My Scores lists the new score; it opens and is playable ------------------------------------------------------------
  I.click(locate('a.user-link').withText(USER.name));
  I.waitInUrl('/account/home');
  I.click(locate('a').withText('My Scores'));
  I.waitInUrl('/account/scores');
  const myScore = locate('table tbody tr').withText(TITLE).withText(artistName);
  I.waitForElement(myScore, 15);
  I.see('1 score'); // the account owns exactly this score
  I.click(myScore);
  I.waitInUrl('/score/');
  I.waitForText(TITLE, 15, 'h1');
  I.click(locate('button').withText('Practice'));
  I.waitInUrl('/work/');
  I.waitForElement('#osmdSvgPage1', 30); // sheet music rendered
  I.waitForText('Welcome to the Workbench!', 15); // first-visit guided tour
  I.click(locate('button').withAttr({ 'aria-label': 'Close' }));
  I.waitForInvisible('.beacon-tooltip', 5);
  const before = await I.executeScript(() => {
    const c = document.getElementById('cursorImg-0');
    return c ? { left: c.style.left, top: c.style.top } : null;
  });
  I.click('#play-pause button');
  I.waitForElement('#play-pause ng-icon[name="bootstrapPauseFill"]', 5);
  // Playable: the cursor moves once the soundfont is loaded and the count-in is over
  I.waitForFunction(
    (left, top) => {
      const c = document.getElementById('cursorImg-0');
      return !!c && (c.style.left !== left || c.style.top !== top);
    },
    [before?.left ?? '', before?.top ?? ''],
    30,
  );
  I.click('#play-pause button');
  I.waitForElement('#play-pause ng-icon[name="bootstrapPlayFill"]', 5);
  // The workbench has no site header: back to the score page through its info button
  I.click('#score-info');
  I.waitInUrl('/score/');
  I.waitForText(TITLE, 15, 'h1');

  // --- Delete the account, so the next run starts from scratch ---------------------------------------------------------
  await deleteAccount(I);
});
