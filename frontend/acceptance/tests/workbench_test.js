import assert from 'node:assert/strict';

Feature('Workbench');

const SCORE = '/work/hill-mildred-j-happy-birthday-to-you';
const PLAY = 'bootstrapPlayFill';
const PAUSE = 'bootstrapPauseFill';
const TOOLS = ['#fullscreen', '#score-info', '#reset-score', '#midi-setup', '#showTempo', '#loop', '#left-hand', '#right-hand'];

/** Current player state, read from the page. */
const state = I => I.executeScript(() => {
  const cursor = document.getElementById('cursorImg-0');
  const handles = [...document.querySelectorAll('#measure-range .noUi-handle')].map(h => Number(h.getAttribute('aria-valuenow')));
  return {
    icon: document.querySelector('#play-pause ng-icon')?.getAttribute('name'),
    cursorVisible: !!cursor && getComputedStyle(cursor).display !== 'none',
    cursor: cursor ? { left: parseFloat(cursor.style.left || '0'), top: parseFloat(cursor.style.top || '0') } : null,
    // [range start, current measure, range end]
    handles,
    sliderDisabled: document.getElementById('measure-range')?.hasAttribute('disabled'),
  };
});

const isPlaying = I => I.waitForElement(`#play-pause ng-icon[name="${PAUSE}"]`, 5);
const isStopped = (I, seconds = 5) => I.waitForElement(`#play-pause ng-icon[name="${PLAY}"]`, seconds);
/** Waits until the cursor has moved away from a position (playback really advances, not just the icon). */
const cursorMovesFrom = (I, from, seconds = 25) => I.waitForFunction(
  (left, top) => {
    const c = document.getElementById('cursorImg-0');
    return c && getComputedStyle(c).display !== 'none'
      && (parseFloat(c.style.left) !== left || parseFloat(c.style.top) !== top);
  },
  [from.left, from.top],
  seconds,
);

// Visitor opens the workbench directly and puts the player through its paces: tempo limits, play, pause,
// resume, play to the end, rapid toggling, score-area clicks, keyboard, toggles, reset. No uncaught
// JavaScript error may happen along the way.
Scenario('torture the workbench player', async ({ I }) => {
  const pageErrors = [];
  await I.usePlaywrightTo('collect uncaught page errors', async ({ page }) => {
    page.on('pageerror', error => pageErrors.push(error.message));
  });

  // --- Load ---------------------------------------------------------------------------------------------
  I.amOnPage(SCORE);
  I.waitForElement('#osmdSvgPage1', 20); // sheet music rendered
  I.waitForText('Welcome to the Workbench!', 15); // first-visit guided tour
  I.click(locate('button').withAttr({ 'aria-label': 'Close' }));
  I.waitForInvisible('.beacon-tooltip', 5);

  // --- Initial state ------------------------------------------------------------------------------------
  I.waitForFunction(() => document.title.includes('Happy Birthday to You'), 15);
  await isStopped(I);
  for (const tool of TOOLS) I.seeElement(tool);
  I.seeNumberOfElements('#keyboard svg rect', 88); // full 88-key piano
  const start = { left: 50, top: 76 }; // cursor position on the first note (first system)
  let s = await state(I);
  assert.equal(s.cursorVisible, true, 'cursor shown once the score is ready');
  assert.deepEqual(s.cursor, start, 'cursor on the first note before playing');
  assert.deepEqual(s.handles, [0, 0, 17], 'measure range covers the 17 measures, current measure 0');

  // --- Tempo: limits and controls -----------------------------------------------------------------------
  const tempoNumber = 'app-tempo-control input[type="number"]';
  const tempoRange = 'app-tempo-control input[type="range"]';
  I.click('#showTempo label');
  I.waitForText('Tempo', 5, 'app-tempo-control');
  I.seeInField(tempoNumber, '104'); // the score's own tempo
  I.fillField(tempoNumber, '999');
  I.seeInField(tempoNumber, '200'); // clamped to the maximum
  I.seeInField(tempoRange, '200');
  I.fillField(tempoNumber, '1');
  I.seeInField(tempoNumber, '20'); // clamped to the minimum
  I.seeInField(tempoRange, '20');
  I.fillField(tempoNumber, '199');
  I.click(locate('app-tempo-control button').at(2)); // "+"
  I.seeInField(tempoNumber, '200');
  I.seeInField(tempoRange, '200');
  I.click(locate('app-tempo-control button').withText('Close'));
  I.dontSeeElement('app-tempo-control .modal');

  // --- Play: the cursor advances and the measure follows -------------------------------------------------
  I.click('#play-pause button');
  await isPlaying(I);
  for (const tool of TOOLS) I.dontSeeElement(tool); // only play/pause while playing
  await cursorMovesFrom(I, start); // soundfont download + count-in, then notes
  s = await state(I);
  assert.equal(s.sliderDisabled, true, 'measure range locked while playing');

  // --- Pause: everything freezes, controls come back ------------------------------------------------------
  I.click('#play-pause button');
  await isStopped(I);
  const paused = (await state(I)).cursor;
  I.wait(1.5);
  assert.deepEqual((await state(I)).cursor, paused, 'cursor does not move while paused');
  for (const tool of TOOLS) I.seeElement(tool);
  assert.equal((await state(I)).sliderDisabled, false, 'measure range unlocked when paused');

  // --- Resume and play to the end (200 BPM) ----------------------------------------------------------------
  I.click('#play-pause button');
  await isPlaying(I);
  await cursorMovesFrom(I, paused);
  await isStopped(I, 45); // the score ends by itself
  s = await state(I);
  assert.deepEqual(s.cursor, start, 'cursor back on the first note after the end');

  // --- Rapid toggling: 7 clicks end in "playing", one more stops ------------------------------------------
  for (let i = 0; i < 7; i++) I.click('#play-pause button');
  await isPlaying(I);
  I.click('#play-pause button');
  await isStopped(I);
  for (const tool of TOOLS) I.seeElement(tool);

  // --- Clicking the sheet music toggles playback ------------------------------------------------------------
  I.click('#reset-score');
  I.click('.score-container');
  await isPlaying(I);
  await cursorMovesFrom(I, start);
  I.click('.score-container');
  await isStopped(I);

  // --- On-screen keyboard: play a few keys --------------------------------------------------------------------
  // Playwright CSS locator: XPath built by locate().at() does not match SVG-namespaced elements
  for (const key of [39, 41, 43, 44, 46]) I.click({ pw: `#keyboard svg rect >> nth=${key}` });

  // --- Practice toggles: loop, wait for left / right hand -------------------------------------------------------
  for (const toggle of ['#loop', '#left-hand', '#right-hand']) {
    I.dontSeeCheckboxIsChecked(`${toggle} input`);
    I.click(`${toggle} label`);
    I.seeCheckboxIsChecked(`${toggle} input`);
    I.click(`${toggle} label`);
    I.dontSeeCheckboxIsChecked(`${toggle} input`);
  }

  // --- Reset: back to the first note ---------------------------------------------------------------------------
  I.click('#reset-score');
  I.wait(1);
  s = await state(I);
  assert.equal(s.icon, PLAY);
  assert.equal(s.handles[1], 0, 'current measure back to the start');

  // --- No uncaught JavaScript error at any point ------------------------------------------------------------------
  await I.usePlaywrightTo('check page errors', async () => {
    assert.deepEqual(pageErrors, [], `uncaught page errors: ${pageErrors.join(' | ')}`);
  });
});
