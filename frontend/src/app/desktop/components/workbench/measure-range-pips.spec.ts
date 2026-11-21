import { MAX_MEASURE_LABELS, measureLabelStep, measurePipFilter } from './measure-range-pips';

describe('measure range pips', () => {
  it('numbers every 1, 2, 5, 10... measures, at most about MAX_MEASURE_LABELS of them', () => {
    expect(measureLabelStep(8)).toBe(1);
    expect(measureLabelStep(12)).toBe(1);
    expect(measureLabelStep(16)).toBe(2);
    expect(measureLabelStep(32)).toBe(5);
    expect(measureLabelStep(100)).toBe(10);
    expect(measureLabelStep(240)).toBe(20);
    for (const count of [3, 17, 64, 150, 999]) {
      expect(count / measureLabelStep(count)).toBeLessThanOrEqual(MAX_MEASURE_LABELS);
    }
  });

  it('numbers the first and the last measures, and the multiples of the step', () => {
    const filter = measurePipFilter(32); // step 5; slider values are 0-based
    expect(filter(0)).toBe(1); // measure 1
    expect(filter(4)).toBe(1); // measure 5
    expect(filter(31)).toBe(1); // measure 32, the last
    expect(filter(1)).toBe(0); // measure 2: a plain mark
  });

  it('draws only the numbered marks on long scores', () => {
    const filter = measurePipFilter(120); // step 10
    expect(filter(9)).toBe(1);
    expect(filter(10)).toBe(-1);
  });
});
