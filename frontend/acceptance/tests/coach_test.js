import assert from 'node:assert/strict';

Feature('Remote coach');

// End to end (issue #414): an external AI assistant, played by this test through the real MCP endpoint with an
// access token, drives the player in a logged-in tab where Remote coach is on.
//
// The acceptance run serves a fresh frontend against the production API: until the coach backend is deployed
// there, the scenario detects the missing endpoints and skips (it says so in the report).
const API = process.env.ACCEPTANCE_API || 'https://api.pianoml.org';
// Its own account, created and deleted by the scenario, so it never interferes with account_test.js.
const USER = {
  name: process.env.ACCEPTANCE_COACH_NAME || 'acceptance-coach',
  email: process.env.ACCEPTANCE_COACH_EMAIL || 'acceptance-coach@example.com',
  password: process.env.ACCEPTANCE_COACH_PASSWORD || 'Acceptance-Coach-2026',
};
const SCORE = 'hill-mildred-j-happy-birthday-to-you';
const PLAY = 'bootstrapPlayFill';
const PAUSE = 'bootstrapPauseFill';

/** Whether the API under test has the coach endpoints. */
async function coachDeployed() {
  try {
    return (await fetch(`${API}/coach/prompts`)).ok;
  } catch {
    return false;
  }
}

/** One MCP tool call, as an assistant makes it; returns the envelope { ok, data } or { ok, code, message }. */
async function mcp(token, tool, args = {}) {
  const response = await fetch(`${API}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: tool, arguments: args } }),
  });
  assert.equal(response.status, 200, `MCP ${tool}: HTTP ${response.status}`);
  const message = await response.json();
  assert.ok(message.result, `MCP ${tool}: ${JSON.stringify(message)}`);
  return JSON.parse(message.result.content[0].text);
}

function submitLogin(I) {
  I.waitForElement('#email');
  I.fillField('#email', USER.email);
  I.fillField('#password', USER.password);
  I.click(locate('button').withAttr({ type: 'submit' }));
  I.waitForFunction(
    () => location.pathname !== '/account/login' || document.body.innerText.includes('Access denied'),
    15,
  );
}

async function login(I) {
  I.amOnPage('/account/login');
  submitLogin(I);
  return !(await I.grabCurrentUrl()).includes('/account/login');
}

async function createAccount(I) {
  I.amOnPage('/account/create');
  I.fillField('#name', USER.name);
  I.fillField('#email', USER.email);
  I.fillField('#password', USER.password);
  I.fillField('#confirmPassword', USER.password);
  I.click('Create Account');
  I.waitInUrl('/account/login');
  if (!(await login(I))) throw new Error('login failed right after creating the account');
}

function deleteAccount(I) {
  I.amOnPage('/account/home');
  I.waitForElement(locate('button').withText('Delete account'), 15);
  I.click(locate('button').withText('Delete account'));
  I.waitForElement('[role="dialog"]');
  I.click(locate('button').withText('Delete my account'));
  I.waitInUrl('/account/login', 15);
}

async function closeTourIfShown(I) {
  const shown = await I.executeScript(() => new Promise(resolve => {
    const started = Date.now();
    const poll = () => {
      if (document.querySelector('.beacon-tooltip')) return resolve(true);
      if (Date.now() - started > 5000) return resolve(false);
      setTimeout(poll, 200);
    };
    poll();
  }));
  if (shown) {
    I.click(locate('button').withAttr({ 'aria-label': 'Close' }));
    I.waitForInvisible('.beacon-tooltip', 5);
  }
}

/** [range start, current measure, range end] of the measure slider, and the loop switch. */
const workbench = I => I.executeScript(() => ({
  handles: [...document.querySelectorAll('#measure-range .noUi-handle')].map(h => Number(h.getAttribute('aria-valuenow'))),
  loop: document.querySelector('#loop input')?.checked ?? null,
}));

Scenario('an assistant opens a score, loops two measures slowly, plays and stops it', async ({ I }) => {
  if (!(await coachDeployed())) {
    I.say(`Skipped: ${API} has no coach endpoints yet (GET /coach/prompts is not available)`);
    return;
  }

  // --- A fresh account, logged in -------------------------------------------------------------------------------
  if (await login(I)) {
    deleteAccount(I);
  }
  await createAccount(I);

  try {
    // --- An access token, created on the account page -----------------------------------------------------------
    I.amOnPage('/account/home');
    I.waitForElement('[data-testid="coach-grant-new"]', 15);
    I.click('[data-testid="coach-grant-new"]');
    I.fillField('#coach-grant-name', 'Acceptance assistant');
    I.click('[data-testid="coach-grant-submit"]');
    I.waitForElement('[data-testid="coach-grant-token"]', 15);
    const token = await I.grabValueFrom('[data-testid="coach-grant-token"]');
    assert.match(token, /^pml_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);

    // --- Without a tab, the assistant is told how to turn Remote coach on ----------------------------------------
    const none = await mcp(token, 'get_player_state');
    assert.equal(none.code, 'NO_ACTIVE_PLAYER');
    assert.match(none.message, /remoteCoach=1/);

    // --- The student opens the workbench and turns Remote coach on ----------------------------------------------
    I.amOnPage(`/work/${SCORE}`);
    await closeTourIfShown(I);
    I.waitForElement(`#play-pause ng-icon[name="${PLAY}"]`, 60);
    I.click('[data-testid="remote-coach-switch"]');
    I.waitForElement('[data-testid="remote-coach-confirm"]', 5);
    I.click('[data-testid="remote-coach-confirm-yes"]');
    I.waitForText('Remote coach on', 15, '[data-testid="remote-coach-status"]');

    // --- The assistant drives the tab -----------------------------------------------------------------------------
    const opened = await mcp(token, 'open_score', { slug: SCORE });
    assert.equal(opened.ok, true, JSON.stringify(opened));
    assert.equal(opened.data.item.slug, SCORE);
    I.waitForText('Controlled by Acceptance assistant', 10, '[data-testid="remote-coach-status"]');

    const configured = await mcp(token, 'configure_practice', { fromMeasure: 1, toMeasure: 2, tempoPercent: 60, loop: true });
    assert.equal(configured.ok, true, JSON.stringify(configured));
    assert.deepEqual(configured.data.range, { fromMeasure: 1, toMeasure: 2 });
    assert.equal(configured.data.tempo.percent, 60);
    const set = await workbench(I);
    assert.deepEqual([set.handles[0], set.handles[2]], [0, 2], 'the measure slider shows measures 1 to 2');
    assert.equal(set.loop, true, 'the loop switch is on');

    const played = await mcp(token, 'play');
    if (played.ok === false) {
      // The browser asks for one click before the first sound
      assert.equal(played.code, 'AUDIO_LOCKED', JSON.stringify(played));
      I.click('[data-testid="remote-coach-start-playback"]');
    }
    I.waitForElement(`#play-pause ng-icon[name="${PAUSE}"]`, 15);

    const stopped = await mcp(token, 'stop');
    assert.equal(stopped.ok, true, JSON.stringify(stopped));
    assert.equal(stopped.data.playing, false);
    I.waitForElement(`#play-pause ng-icon[name="${PLAY}"]`, 10);

    // --- Turned off, the tab is out of reach again -------------------------------------------------------------------
    I.click('[data-testid="remote-coach-switch"]');
    I.waitForText('Remote coach', 5, '[data-testid="remote-coach-status"]');
    I.wait(1);
    assert.equal((await mcp(token, 'stop')).code, 'NO_ACTIVE_PLAYER');
  } finally {
    // The account and its token go away together (grants are deleted with the account)
    deleteAccount(I);
  }
});
