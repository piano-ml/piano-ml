import { TestBed } from '@angular/core/testing';
import type { PlayConfiguration } from '../model/model';
import { PlayerStateService } from './player-state.service';

describe('PlayerStateService', () => {
  let state: PlayerStateService;

  beforeEach(() => {
    state = TestBed.inject(PlayerStateService);
    state.playConfiguration = { tempoFactor: 1, delayFactor: 1 } as PlayConfiguration;
  });

  describe('getTimeFactor', () => {
    it('is delayFactor / tempoFactor', () => {
      expect(state.getTimeFactor()).toBe(1);
      state.playConfiguration.tempoFactor = 2;
      expect(state.getTimeFactor()).toBe(0.5); // twice as fast: half the time
      state.playConfiguration.delayFactor = 3;
      expect(state.getTimeFactor()).toBe(1.5);
    });

    it('is cached while the factors do not change', () => {
      const config = { delayFactor: 1 } as PlayConfiguration;
      let reads = 0;
      Object.defineProperty(config, 'tempoFactor', { get: () => { reads++; return 2; } });
      state.playConfiguration = config;
      state.getTimeFactor();
      const afterFirst = reads;
      state.getTimeFactor();
      state.getTimeFactor();
      expect(reads - afterFirst).toBe(2); // only the cache check, no recomputation
      expect(state.getTimeFactor()).toBe(0.5);
    });

    it('is recomputed after invalidateTimeFactorCache()', () => {
      expect(state.getTimeFactor()).toBe(1);
      state.invalidateTimeFactorCache();
      state.playConfiguration.tempoFactor = 4;
      expect(state.getTimeFactor()).toBe(0.25);
    });
  });

  it('reset() forgets the last MIDI event time', () => {
    state.lastMidiEventTime = 12;
    state.reset();
    expect(state.lastMidiEventTime).toBe(-1);
  });

  it('resetSession() puts the whole session back to its initial state', () => {
    Object.assign(state, { osmd: {}, duration: 90, isWaiting: true, currentMeasure: 4, lastMidiEventTime: 3, ticks: 960, tick: 12 });
    state.message.set('Play the left hand');
    state.elapsedTime.next(42);
    state.getTimeFactor();

    state.resetSession();

    expect(state.osmd).toBeNull();
    expect(state.message()).toBe('');
    expect(state.elapsedTime.value).toBe(0);
    expect([state.duration, state.isWaiting, state.currentMeasure, state.lastMidiEventTime, state.ticks, state.tick])
      .toEqual([0, false, -1, -1, 0, 0]);
    state.playConfiguration.tempoFactor = 2;
    expect(state.getTimeFactor()).toBe(0.5); // cache was cleared
  });

  it('defaults to the full 88-key range', () => {
    expect([state.leftmostKey, state.rightmostKey]).toEqual([21, 108]);
  });
});
