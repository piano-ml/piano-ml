import { AudioMixerService, DEFAULT_LEVELS, MIXER_BUSES, MIXER_STORAGE_KEY } from './audio-mixer.service';

describe('AudioMixerService', () => {
  afterEach(() => localStorage.removeItem(MIXER_STORAGE_KEY));

  it('starts with the default levels: the score and the metronome at 30 %, the accompaniment full', () => {
    const mixer = new AudioMixerService();
    expect(mixer.levels()).toEqual({ score: 0.3, accompaniment: 1, metronome: 0.3 });
    expect(DEFAULT_LEVELS).toEqual(mixer.levels());
    expect(MIXER_BUSES).toEqual(['score', 'accompaniment', 'metronome']);
  });

  it('scales the velocities of a bus by its level, clamped to 0..1', () => {
    const mixer = new AudioMixerService();
    mixer.setLevel('accompaniment', 0.5);
    expect(mixer.velocity('accompaniment', 100)).toBe(50);
    expect(mixer.velocity('score', 100)).toBe(30);
    mixer.setLevel('metronome', 3);
    expect(mixer.level('metronome')).toBe(1);
    mixer.setLevel('metronome', -1);
    expect(mixer.isMuted('metronome')).toBe(true);
    mixer.setLevel('score', Number.NaN);
    expect(mixer.level('score')).toBe(0.3);
  });

  it('leaves the velocities of no bus as they are (count-in, calibration)', () => {
    const mixer = new AudioMixerService();
    mixer.setLevel('metronome', 0);
    expect(mixer.velocity(null, 127)).toBe(127);
  });

  it('keeps the levels for the next visits, and resets them to the defaults', () => {
    new AudioMixerService().setLevel('score', 0.8);
    const next = new AudioMixerService();
    expect(next.level('score')).toBe(0.8);
    expect(next.level('accompaniment')).toBe(1);
    next.reset();
    expect(new AudioMixerService().levels()).toEqual(DEFAULT_LEVELS);
  });

  it('ignores stored levels that are not valid', () => {
    localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify({ score: 2, accompaniment: 'loud', metronome: 0.5 }));
    expect(new AudioMixerService().levels()).toEqual({ score: 0.3, accompaniment: 1, metronome: 0.5 });
    localStorage.setItem(MIXER_STORAGE_KEY, 'not json');
    expect(new AudioMixerService().levels()).toEqual(DEFAULT_LEVELS);
  });
});
