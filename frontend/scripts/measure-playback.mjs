#!/usr/bin/env node
/**
 * Measures workbench playback performance in headless Chromium (issue #429), so that the exact same run can be
 * repeated before and after a change.
 *
 * Usage (with the dev server running: `npm start` in another terminal):
 *
 *   npm run measure:playback                                   # 1 run, default score, prints the JSON summary
 *   npm run measure:playback -- --runs 3 --out results.jsonl   # 3 runs, prints the median, appends every run
 *   npm run measure:playback -- --slug some-other-score --base http://localhost:4200 --trace trace.json
 *
 * Options:
 *   --base <url>      dev server (default http://localhost:4200)
 *   --slug <slug>     score to play (default beethoven-ludwig-van-ode-to-joy, the reference score of #429:
 *                     keep it for every before/after comparison)
 *   --runs <n>        runs to do; the summary printed is the median of each metric (default 1)
 *   --out <file>      appends one JSON line per run, plus one for the median, to this file
 *   --trace <file>    also saves a Chrome trace of the (last) run, to open in DevTools > Performance
 *   --timeout <s>     fails the run if the score has not played to its end by then (default MEASURE_TIMEOUT_SECONDS)
 *   --headed          shows the browser
 *
 * The score plays in play-along mode from its first measure to its end (the Play button comes back), so every
 * run covers exactly the same notes. Metrics:
 *   - longFrames16: frames longer than 16 ms, i.e. that missed a 60 Hz vsync (requestAnimationFrame deltas over
 *     MISSED_FRAME_MS: the browser only reports long-animation-frame entries from 50 ms on);
 *   - longFrames50: frames over 50 ms (long-animation-frame entries, else longtask);
 *   - frameP95Ms / frameMaxMs: from requestAnimationFrame deltas while playing;
 *   - playToFirstSoundMs: Play click to the first synth note-on (the "pianoml:first-sound" mark of dev builds);
 *   - changeDetections: ApplicationRef ticks while playing (Angular's dev-mode profiler; null if unavailable);
 *   - playSeconds: Play click to the end of the score.
 *
 * This is a dev tool: not part of `npm test` nor CI. The play statistics request is blocked, so measuring does
 * not count plays on the API the dev server proxies to.
 */
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

/** Reference score of issue #429, used for the baseline and for the measurement after the changes. */
const DEFAULT_SLUG = 'beethoven-ludwig-van-ode-to-joy';
const DEFAULT_BASE = 'http://localhost:4200';
/** Safety net: a run that has not reached the end of the score by then fails. */
const MEASURE_TIMEOUT_SECONDS = 300;
/** Loading the page, the score and the ~10 MB soundfont. */
const LOAD_TIMEOUT_MS = 180_000;
/** Viewport large enough for the workbench toolbar to stay visible while playing (see isSmallScreen()). */
const VIEWPORT = { width: 1600, height: 1000 };
/** Angular ProfilerEvent.ChangeDetectionStart, emitted once per ApplicationRef tick. */
const PROFILER_CHANGE_DETECTION_START = 12;
const FIRST_SOUND_MARK = 'pianoml:first-sound';
/** A requestAnimationFrame delta over this missed at least one 60 Hz vsync (16.7 ms, plus timer jitter). */
const MISSED_FRAME_MS = 16.7 * 1.25;

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: DEFAULT_BASE },
    slug: { type: 'string', default: DEFAULT_SLUG },
    runs: { type: 'string', default: '1' },
    out: { type: 'string' },
    trace: { type: 'string' },
    timeout: { type: 'string', default: String(MEASURE_TIMEOUT_SECONDS) },
    headed: { type: 'boolean', default: false },
  },
});

/** Runs in the page before any of its scripts: frame and long-frame collectors, armed by window.__measure.start(). */
function pageInstrumentation(profilerChangeDetectionStart) {
  const m = {
    active: false, frames: [], long: [], cd: 0, playAt: 0, lastFrame: 0, longType: null,
    start() {
      this.active = true; this.frames = []; this.long = []; this.cd = 0;
      this.playAt = performance.now(); this.lastFrame = 0;
      performance.clearMarks('pianoml:first-sound');
    },
    stop() { this.active = false; },
  };
  window.__measure = m;
  const frame = () => {
    // performance.now(), not the rAF timestamp: that one is the frame's scheduled vsync, which can hide a stall
    const t = performance.now();
    if (m.active) {
      if (m.lastFrame) m.frames.push(t - m.lastFrame);
      m.lastFrame = t;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  for (const type of ['long-animation-frame', 'longtask']) {
    if (PerformanceObserver.supportedEntryTypes?.includes(type)) {
      m.longType = type;
      new PerformanceObserver((list) => {
        if (!m.active) return;
        for (const entry of list.getEntries()) m.long.push(entry.duration);
      }).observe({ type });
      break;
    }
  }
  // Angular registers its dev-mode globals (window.ng) at bootstrap: hook the profiler as soon as it is there
  const hook = setInterval(() => {
    const setProfiler = window.ng?.ɵsetProfiler;
    if (!setProfiler) return;
    clearInterval(hook);
    m.cdAvailable = true;
    setProfiler((event) => {
      if (m.active && event === profilerChangeDetectionStart) m.cd++;
    });
  }, 50);
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const round = (value) => (value == null ? null : Math.round(value * 10) / 10);

async function measureOnce(browser, { tracePath }) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.grantPermissions(['midi'], { origin: new URL(args.base).origin });
  await context.addInitScript(() => {
    // Headless Chromium refuses Web MIDI even when granted (and the blocked-MIDI dialog would cover Play): a
    // MIDI access without devices instead, which also keeps a real keyboard plugged in from changing the run
    const access = {
      inputs: new Map(), outputs: new Map(), sysexEnabled: false, onstatechange: null,
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: async () => access });
    localStorage.setItem('workbench-tour-seen', 'true');
    localStorage.setItem('waitForLeftHand', 'false');
    localStorage.setItem('waitForRightHand', 'false');
    localStorage.setItem('tempo-control-metronome', 'false');
  });
  await context.addInitScript(pageInstrumentation, PROFILER_CHANGE_DETECTION_START);
  // Measuring must not count plays on the API
  await context.route('**/score/play/stats', (route) => route.fulfill({ status: 204 }));

  const page = await context.newPage();
  let soundsReady = false;
  page.on('console', (message) => {
    if (message.text().includes('SoundFont initialized successfully')) soundsReady = true;
  });

  await page.goto(`${args.base}/work/${encodeURIComponent(args.slug)}`, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
  await page.waitForSelector('.osmd-container svg', { timeout: LOAD_TIMEOUT_MS });
  const play = page.locator('#play-pause button');
  await play.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
  // Sounds loaded: the console line of every version, or (once Play is gated on it) an enabled, idle Play button
  const loadDeadline = Date.now() + LOAD_TIMEOUT_MS;
  while (!soundsReady) {
    if (Date.now() > loadDeadline) throw new Error('The sounds did not load in time');
    const gated = await play.evaluate((b) => b.disabled || b.getAttribute('aria-busy') === 'true');
    if (!gated && (await page.evaluate(() => document.querySelector('#play-pause [data-sounds-ready]') !== null))) break;
    await page.waitForTimeout(200);
  }
  // Let the page settle (rendering, deferred work) before measuring
  await page.waitForTimeout(2000);

  if (tracePath) await browser.startTracing(page, { path: tracePath, screenshots: false });

  await page.evaluate(() => window.__measure.start());
  await play.click();
  // Playing: the button becomes Pause. Ended: Play comes back.
  await page.waitForFunction(() => document.querySelector('#play-pause button ng-icon')?.getAttribute('name') === 'bootstrapPauseFill', null, { timeout: 30_000 });
  const timeoutMs = Number(args.timeout) * 1000;
  await page.waitForFunction(() => document.querySelector('#play-pause button ng-icon')?.getAttribute('name') === 'bootstrapPlayFill', null, { timeout: timeoutMs, polling: 250 });

  const raw = await page.evaluate((mark) => {
    const m = window.__measure;
    m.stop();
    const firstSound = performance.getEntriesByName(mark, 'mark').find((e) => e.startTime >= m.playAt);
    return {
      frames: m.frames, long: m.long, longType: m.longType, cd: m.cdAvailable ? m.cd : null,
      playToFirstSoundMs: firstSound ? firstSound.startTime - m.playAt : null,
      playSeconds: (performance.now() - m.playAt) / 1000,
    };
  }, FIRST_SOUND_MARK);

  if (tracePath) await browser.stopTracing();
  await context.close();

  return {
    longFrames16: raw.frames.filter((d) => d > MISSED_FRAME_MS).length,
    longFrames50: raw.long.filter((d) => d > 50).length,
    longFrameSource: raw.longType,
    frameP95Ms: round(percentile(raw.frames, 95)),
    frameMaxMs: round(raw.frames.length ? Math.max(...raw.frames) : null),
    frames: raw.frames.length,
    playToFirstSoundMs: round(raw.playToFirstSoundMs),
    changeDetections: raw.cd,
    playSeconds: round(raw.playSeconds),
  };
}

function median(runs) {
  const result = {};
  for (const key of Object.keys(runs[0])) {
    const values = runs.map((r) => r[key]).filter((v) => typeof v === 'number');
    result[key] = values.length === runs.length ? percentile(values, 50) : runs[0][key];
  }
  return result;
}

const browser = await chromium.launch({
  // Full Chromium in its new headless mode: the default headless shell drives frames virtually, so main-thread
  // stalls do not show in its frame timings
  channel: 'chromium',
  headless: !args.headed,
  // Audio must start without a real user gesture in automation
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const runs = [];
const meta = { slug: args.slug, base: args.base, date: new Date().toISOString() };
try {
  const count = Math.max(1, Number(args.runs) || 1);
  for (let i = 0; i < count; i++) {
    const run = await measureOnce(browser, { tracePath: i === count - 1 ? args.trace : undefined });
    runs.push(run);
    console.error(`run ${i + 1}/${count}: ${JSON.stringify(run)}`);
    if (args.out) appendFileSync(args.out, `${JSON.stringify({ ...meta, run: i + 1, ...run })}\n`);
  }
} finally {
  await browser.close();
}
const summary = { ...meta, runs: runs.length, ...median(runs) };
if (args.out && runs.length > 1) appendFileSync(args.out, `${JSON.stringify({ ...summary, run: 'median' })}\n`);
console.log(JSON.stringify(summary, null, 2));
