import { TestBed } from '@angular/core/testing';

import { ScoreStateService } from './score-state.service';

describe('ScoreStateService', () => {
  let service: ScoreStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScoreStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
