import { ELAPSED_CLASS, IN_RANGE_CLASS, MAX_MEASURE_LABELS, markMeasures, measureLabelStep, measurePipFilter } from './measure-range-pips';

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

  it('marks the measures to be played (start to end) and, among them, the elapsed ones (start to current)', () => {
    // 11 measures (values 0..10): a pip every measure, at left = value * 10 %
    const pips = document.createElement('div');
    for (let value = 0; value <= 10; value++) {
      for (const kind of ['noUi-marker', 'noUi-value']) {
        const pip = document.createElement('div');
        pip.className = kind;
        pip.style.left = `${value * 10}%`;
        pips.appendChild(pip);
      }
    }
    const marked = (cls: string) => [...pips.querySelectorAll('.noUi-marker')]
      .map((pip, value) => (pip.classList.contains(cls) ? value : -1)).filter((v) => v >= 0);

    markMeasures(pips, 1, 3, 5, 10); // measures 2 to 6, at measure 4
    expect(marked(IN_RANGE_CLASS)).toEqual([1, 2, 3, 4, 5]);
    expect(marked(ELAPSED_CLASS)).toEqual([1, 2, 3]);
    expect(pips.querySelectorAll(`.noUi-value.${IN_RANGE_CLASS}`)).toHaveLength(5);

    markMeasures(pips, 1, 5, 5, 10); // playback reached the end of the range
    expect(marked(ELAPSED_CLASS)).toEqual([1, 2, 3, 4, 5]);
    expect(() => markMeasures(null, 0, 1, 2, 10)).not.toThrow();
  });
});
