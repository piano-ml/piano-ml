import { vi } from 'vitest';
import { WorkbenchComponent } from './workbench.component';

/**
 * End-of-playback state, tested on the method alone: the full WorkbenchComponent needs a dozen browser-heavy
 * services (audio, MIDI, OSMD) that this behaviour does not use.
 */
describe('WorkbenchComponent.onPlaybackEnded', () => {
  function workbench(isLoop: boolean) {
    const component = Object.create(WorkbenchComponent.prototype) as WorkbenchComponent;
    const slider = { enable: vi.fn(), disable: vi.fn() };
    Object.assign(component, {
      isPlaying: true,
      toggleToolbar: false,
      slider,
      playConfiguration: { isLoop },
      changeDetector: { markForCheck: vi.fn() },
      recordAssessment: vi.fn(),
    });
    return { component, slider };
  }

  it('returns to the stopped state: play button, toolbar back, measure range unlocked', () => {
    const { component, slider } = workbench(false);

    component.onPlaybackEnded();

    expect(component.isPlaying).toBe(false);
    expect(component.toggleToolbar).toBe(true);
    expect(slider.enable).toHaveBeenCalledOnce();
    expect(component.recordAssessment).toHaveBeenCalledOnce();
  });

  it('in loop mode the player restarts: stays playing, range stays locked', () => {
    const { component, slider } = workbench(true);

    component.onPlaybackEnded();

    expect(component.isPlaying).toBe(true);
    expect(slider.enable).not.toHaveBeenCalled();
    expect(component.recordAssessment).toHaveBeenCalledOnce();
  });

  it('works before the slider exists', () => {
    const { component } = workbench(false);
    (component as unknown as { slider: unknown }).slider = undefined;

    expect(() => component.onPlaybackEnded()).not.toThrow();
    expect(component.isPlaying).toBe(false);
  });
});
