import {
  CALIBRATION_MAX_MS, CALIBRATION_MIN_TAPS, CALIBRATION_WARMUP_CLICKS, LATENCY_CALIBRATION_KEY, calibrationOffsetMs,
  readLatencyCalibration, writeLatencyCalibration,
} from './latency-calibration';

/** The tap-along calibration: the median gap between the clicks heard and the keys played. */
describe('latency calibration', () => {
  const interval = 0.5;
  const clicks = Array.from({ length: 12 }, (_, i) => 10 + i * interval);
  const measured = clicks.slice(CALIBRATION_WARMUP_CLICKS);

  it('is the median gap between the measured clicks and the taps, in ms', () => {
    const taps = measured.map((click, i) => click + [0.08, 0.09, 0.07, 0.3 /* a slip */, 0.08, 0.08, 0.09, 0.07][i]);
    expect(calibrationOffsetMs(clicks, taps, interval)).toBe(80);
  });

  it('can be negative: a user who plays ahead of the beat', () => {
    expect(calibrationOffsetMs(clicks, measured.map((c) => c - 0.03), interval)).toBe(-30);
  });

  it('ignores the warm-up clicks, taps far from any click, and a second tap on the same click', () => {
    const warmup = clicks.slice(0, CALIBRATION_WARMUP_CLICKS).map((c) => c + 0.2);
    const taps = [...warmup, ...measured.map((c) => c + 0.05), measured[0] + 0.06, measured[1] + interval / 2];
    expect(calibrationOffsetMs(clicks, taps, interval)).toBe(50);
  });

  it(`needs ${CALIBRATION_MIN_TAPS} taps on the beat`, () => {
    const few = measured.slice(0, CALIBRATION_MIN_TAPS - 1).map((c) => c + 0.05);
    expect(calibrationOffsetMs(clicks, few, interval)).toBeNull();
    expect(calibrationOffsetMs(clicks, [...few, measured[7] + 0.05], interval)).toBe(50);
  });

  it(`refuses a correction over ${CALIBRATION_MAX_MS} ms`, () => {
    const slow = Array.from({ length: 12 }, (_, i) => 10 + i * 2);
    expect(calibrationOffsetMs(slow, slow.slice(CALIBRATION_WARMUP_CLICKS).map((c) => c + 0.45), 2)).toBeNull();
  });

  it('is kept in localStorage, 0 meaning none', () => {
    writeLatencyCalibration(120);
    expect(localStorage.getItem(LATENCY_CALIBRATION_KEY)).toBe('120');
    expect(readLatencyCalibration()).toBe(120);
    writeLatencyCalibration(0);
    expect(localStorage.getItem(LATENCY_CALIBRATION_KEY)).toBeNull();
    localStorage.setItem(LATENCY_CALIBRATION_KEY, 'nonsense');
    expect(readLatencyCalibration()).toBe(0);
    localStorage.removeItem(LATENCY_CALIBRATION_KEY);
  });
});
