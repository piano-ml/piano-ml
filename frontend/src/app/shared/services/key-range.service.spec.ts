import { TestBed } from '@angular/core/testing';
import { KeyRangeService } from './key-range.service';
import { PlayerStateService } from '../../desktop/service/player-state.service';

describe('KeyRangeService', () => {
  const stored = () => JSON.parse(localStorage.getItem('preferences') ?? 'null');

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to the full 88 keys', () => {
    expect(TestBed.inject(KeyRangeService).range()).toEqual({ leftmostKey: 21, rightmostKey: 108 });
  });

  it('starts from the stored range', () => {
    localStorage.setItem('preferences', JSON.stringify({ leftmostKey: 36, rightmostKey: 96 }));
    expect(TestBed.inject(KeyRangeService).range()).toEqual({ leftmostKey: 36, rightmostKey: 96 });
  });

  it('ignores corrupted stored preferences', () => {
    localStorage.setItem('preferences', '{not json');
    expect(TestBed.inject(KeyRangeService).range()).toEqual({ leftmostKey: 21, rightmostKey: 108 });
  });

  it('saves the range, keeping the other stored preferences', () => {
    localStorage.setItem('preferences', JSON.stringify({ other: 'kept' }));
    TestBed.inject(KeyRangeService).save({ leftmostKey: 36, rightmostKey: 96 });
    expect(stored()).toEqual({ other: 'kept', leftmostKey: 36, rightmostKey: 96 });
  });

  it('applies a saved range to playback at once', () => {
    const state = TestBed.inject(PlayerStateService);
    TestBed.inject(KeyRangeService).save({ leftmostKey: 36, rightmostKey: 96 });
    expect([state.leftmostKey, state.rightmostKey]).toEqual([36, 96]);
  });

  it('reload picks up a range stored elsewhere (another tab)', () => {
    const service = TestBed.inject(KeyRangeService);
    localStorage.setItem('preferences', JSON.stringify({ leftmostKey: 48, rightmostKey: 84 }));
    service.reload();
    expect(service.range()).toEqual({ leftmostKey: 48, rightmostKey: 84 });
  });
});
