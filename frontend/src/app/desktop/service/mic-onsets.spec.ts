import { CLICK_SEARCH_S, findClickOnsets, joinChunks } from './mic-onsets';

/**
 * The loopback calibration's microphone side on synthetic recordings: a quiet room heard by a cheap microphone (a
 * little noise, a DC offset) with metronome clicks arriving some time after they were played.
 */
describe('microphone clicks', () => {
  const RATE = 48000;

  /** A recording starting at context time `startTime`, with a click's sound at each of `sounds` (context times). */
  function recording(seconds: number, sounds: number[], { startTime = 0, dc = 0.02, noise = 0.002, click = 0.3 } = {}) {
    const samples = new Float32Array(Math.round(seconds * RATE));
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < samples.length; i++) {
      samples[i] = dc + noise * random();
    }
    for (const at of sounds) {
      // A click: a 3 kHz burst decaying over about 30 ms
      const start = Math.round((at - startTime) * RATE);
      for (let i = 0; i < 0.04 * RATE && start + i < samples.length; i++) {
        samples[start + i] += click * Math.exp(-i / (0.008 * RATE)) * Math.sin(2 * Math.PI * 3000 * i / RATE);
      }
    }
    return { samples, sampleRate: RATE, startTime };
  }

  const clicks = [1, 1.6667, 2.3333, 3, 3.6667];

  it('finds when each click was heard, to the millisecond, despite noise and a DC offset', () => {
    const onsets = findClickOnsets(recording(4.5, clicks.map((c) => c + 0.237), { startTime: 0.2 }), clicks);
    expect(onsets.map((o) => o.click)).toEqual([0, 1, 2, 3, 4]);
    for (const [i, onset] of onsets.entries()) {
      expect(onset.time! - clicks[i]).toBeCloseTo(0.237, 2);
      expect(onset.levelDb).toBeGreaterThan(20);
    }
  });

  it('finds quiet clicks too: the level that counts is the one above the background', () => {
    const onsets = findClickOnsets(recording(4.5, clicks.map((c) => c + 0.1), { noise: 0.0003, click: 0.005 }), clicks);
    expect(onsets.map((o) => o.time === null ? null : Math.round((o.time - clicks[o.click]) * 1000))).toEqual([100, 100, 100, 100, 100]);
  });

  it('says a click was not heard rather than taking the background for it', () => {
    const onsets = findClickOnsets(recording(4.5, [clicks[0] + 0.2, clicks[2] + 0.2]), clicks);
    expect(onsets.map((o) => o.time !== null)).toEqual([true, false, true, false, false]);
  });

  it('ignores a sound later than the search window after its click', () => {
    const [onset] = findClickOnsets(recording(2, [1 + CLICK_SEARCH_S + 0.02]), [1]);
    expect(onset.time).toBeNull();
  });

  it('joins the chunks on their times, a dropped chunk left silent', () => {
    const joined = joinChunks([
      { time: 10, samples: new Float32Array([1, 1]) },
      { time: 10 + 4 / RATE, samples: new Float32Array([2]) },
    ], RATE);
    expect(joined.startTime).toBe(10);
    expect([...joined.samples]).toEqual([1, 1, 0, 0, 2]);
  });
});
