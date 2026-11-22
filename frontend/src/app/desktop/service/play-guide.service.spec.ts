import { PlayGuideService, type PlayGuideOutput } from './play-guide.service';

describe('PlayGuideService', () => {
  const output = () => ({ noteOn: vi.fn(), noteOff: vi.fn(), allOff: vi.fn() });

  it('sends nothing without an output', () => {
    expect(() => new PlayGuideService().noteOn(60, 0.5, 'rh', 0)).not.toThrow();
  });

  it('sends every note to every output, until it is removed (turned off on the way out)', () => {
    const guide = new PlayGuideService();
    const leds = output();
    const remove = guide.register(leds as PlayGuideOutput);
    guide.noteOn(60, 0.5, 'rh', 100);
    guide.noteOff(60, 'rh', 200);
    guide.allOff();
    expect(leds.noteOn).toHaveBeenCalledWith(60, 0.5, 'rh', 100);
    expect(leds.noteOff).toHaveBeenCalledWith(60, 'rh', 200);
    expect(leds.allOff).toHaveBeenCalledOnce();

    remove();
    expect(leds.allOff).toHaveBeenCalledTimes(2);
    guide.noteOn(62, 0.5, 'lh', 300);
    expect(leds.noteOn).toHaveBeenCalledOnce();
  });

  it('an output that fails stops neither the others nor the playback', () => {
    const guide = new PlayGuideService();
    const broken = { ...output(), noteOn: vi.fn(() => { throw new Error('unplugged'); }) };
    const fine = output();
    guide.register(broken as PlayGuideOutput);
    guide.register(fine as PlayGuideOutput);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => guide.noteOn(60, 0.5, 'rh', 0)).not.toThrow();
    expect(fine.noteOn).toHaveBeenCalled();
  });
});
