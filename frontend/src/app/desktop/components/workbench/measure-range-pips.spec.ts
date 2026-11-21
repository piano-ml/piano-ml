import { ELAPSED_CLASS, MAX_MEASURE_LABELS, markElapsedMeasures, measureLabelStep, measurePipFilter } from './measure-range-pips';

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

  it('marks the pips of the elapsed measures, from the start handle to the current one', () => {
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
    const elapsed = () => [...pips.querySelectorAll('.noUi-marker')]
      .map((pip, value) => (pip.classList.contains(ELAPSED_CLASS) ? value : -1)).filter((v) => v >= 0);

    markElapsedMeasures(pips, 2, 5, 10);
    expect(elapsed()).toEqual([2, 3, 4, 5]);
    expect(pips.querySelectorAll(`.noUi-value.${ELAPSED_CLASS}`)).toHaveLength(4);

    markElapsedMeasures(pips, 2, 7, 10); // playback moved on
    expect(elapsed()).toEqual([2, 3, 4, 5, 6, 7]);
    expect(() => markElapsedMeasures(null, 0, 1, 10)).not.toThrow();
  });
});
