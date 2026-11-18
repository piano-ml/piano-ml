/**
 * Tap-along latency calibration: the app plays clicks, the user taps a key on each one, and the median gap
 * between what they heard and when their key arrived is what the browser's own latency figures miss (Bluetooth
 * headphones, a slow MIDI interface, a habit of playing early or late).
 */

/** Clicks played for a calibration. */
export const CALIBRATION_CLICKS = 12;
/** The first clicks are not measured: the user is finding the beat. */
export const CALIBRATION_WARMUP_CLICKS = 4;
/** Tempo of the clicks: slow enough to tap each one comfortably. */
export const CALIBRATION_BPM = 90;
/** Taps needed on the measured clicks for a result. */
export const CALIBRATION_MIN_TAPS = 5;
/** Larger corrections are taken as a failed calibration, not as a latency. */
export const CALIBRATION_MAX_MS = 400;
/** Where the correction is kept between visits. */
export const LATENCY_CALIBRATION_KEY = 'audioLatencyCalibrationMs';

/**
 * The calibration's correction, in milliseconds (positive: the keys arrive after the sound is heard), or null
 * without enough taps near the measured clicks.
 * @param clicks when each click was heard, in seconds (audio context time)
 * @param taps when each key was played, in the same clock
 * @param interval seconds between two clicks
 */
export function calibrationOffsetMs(clicks: number[], taps: number[], interval: number, warmup = CALIBRATION_WARMUP_CLICKS): number | null {
  const measured = clicks.slice(warmup);
  const gaps: number[] = [];
  const used = new Set<number>();
  for (const tap of taps) {
    let best = -1;
    for (let i = 0; i < measured.length; i++) {
      if (best < 0 || Math.abs(tap - measured[i]) < Math.abs(tap - measured[best])) best = i;
    }
    // One tap per click, and only taps that clearly belong to it
    if (best < 0 || used.has(best) || Math.abs(tap - measured[best]) >= interval / 2) continue;
    used.add(best);
    gaps.push((tap - measured[best]) * 1000);
  }
  if (gaps.length < CALIBRATION_MIN_TAPS) return null;
  gaps.sort((a, b) => a - b);
  const middle = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
  return Math.abs(median) > CALIBRATION_MAX_MS ? null : Math.round(median);
}

/** The stored correction (0 when there is none, or storage is unavailable). */
export function readLatencyCalibration(): number {
  try {
    const value = Number(localStorage.getItem(LATENCY_CALIBRATION_KEY));
    return Number.isFinite(value) && Math.abs(value) <= CALIBRATION_MAX_MS ? value : 0;
  } catch {
    return 0;
  }
}

export function writeLatencyCalibration(ms: number): void {
  try {
    if (ms === 0) {
      localStorage.removeItem(LATENCY_CALIBRATION_KEY);
    } else {
      localStorage.setItem(LATENCY_CALIBRATION_KEY, String(ms));
    }
  } catch {
    // storage unavailable: the correction lasts for this visit
  }
}
