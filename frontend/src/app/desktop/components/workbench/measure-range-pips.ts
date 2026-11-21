/** About this many measure numbers under the measure range slider, whatever the length of the score. */
export const MAX_MEASURE_LABELS = 12;

/** Beyond this many measures, only the numbered marks are drawn (a mark per measure would be a grey smudge). */
export const MAX_MEASURE_MARKS = 50;

const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];

/** Every how many measures a number is shown: 1, 2, 5, 10... so that at most MAX_MEASURE_LABELS are shown. */
export function measureLabelStep(measureCount: number): number {
  return NICE_STEPS.find(step => measureCount / step <= MAX_MEASURE_LABELS) ?? Math.ceil(measureCount / MAX_MEASURE_LABELS);
}

/**
 * The noUiSlider pips filter of the measure range slider: `value` is the slider's 0-based value (measure value + 1).
 * Returns 1 for a numbered mark (the first and last measures, and every measureLabelStep()), 0 for a plain mark,
 * -1 for none (long scores).
 */
export function measurePipFilter(measureCount: number): (value: number) => number {
  const step = measureLabelStep(measureCount);
  const last = Math.max(0, measureCount - 1);
  return (value: number) => {
    const measure = Math.round(value) + 1;
    if (value === 0 || Math.round(value) === last || measure % step === 0) return 1;
    return measureCount > MAX_MEASURE_MARKS ? -1 : 0;
  };
}

/** The class of the marks and numbers of the elapsed measures (from the start of the range to the current one). */
export const ELAPSED_CLASS = 'is-elapsed';

/**
 * Marks the pips (marks and numbers) of the elapsed measures, from the start handle to the current one, in the
 * pips container of the slider. Values are the slider's 0-based ones; `max` is the last of them. A pip's measure is
 * read from its position (style.left, in percent of the track), as noUiSlider places it.
 */
export function markElapsedMeasures(pips: Element | null, start: number, current: number, max: number): void {
  if (!pips) return;
  const from = Math.min(start, current);
  const to = Math.max(start, current);
  pips.querySelectorAll<HTMLElement>('.noUi-marker, .noUi-value').forEach(pip => {
    const left = parseFloat(pip.style.left);
    const value = Number.isFinite(left) ? Math.round((max * left) / 100) : NaN;
    pip.classList.toggle(ELAPSED_CLASS, value >= from && value <= to);
  });
}
