import { TestBed } from '@angular/core/testing';

import { HandDetectorService } from './hand-detector.service';

describe('HandDetectorService', () => {
  let service: HandDetectorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HandDetectorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
