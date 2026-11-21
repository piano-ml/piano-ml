import { AudioMixerService, FULL_LEVELS, MIXER_BUSES } from './audio-mixer.service';

describe('AudioMixerService', () => {
  it('starts with every bus at its full level: the sound as it always was', () => {
    const mixer = new AudioMixerService();
    expect(mixer.levels()).toEqual(FULL_LEVELS);
    expect(MIXER_BUSES).toEqual(['score', 'accompaniment', 'metronome']);
    expect(mixer.velocity('score', 100)).toBe(100);
  });

  it('scales the velocities of a bus by its level, clamped to 0..1', () => {
    const mixer = new AudioMixerService();
    mixer.setLevel('accompaniment', 0.5);
    expect(mixer.velocity('accompaniment', 100)).toBe(50);
    expect(mixer.velocity('score', 100)).toBe(100);
    mixer.setLevel('metronome', 3);
    expect(mixer.level('metronome')).toBe(1);
    mixer.setLevel('metronome', -1);
    expect(mixer.isMuted('metronome')).toBe(true);
    mixer.setLevel('score', Number.NaN);
    expect(mixer.level('score')).toBe(1);
  });

  it('leaves the velocities of no bus as they are', () => {
    const mixer = new AudioMixerService();
    mixer.setLevel('metronome', 0);
    expect(mixer.velocity(null, 127)).toBe(127);
  });
});
