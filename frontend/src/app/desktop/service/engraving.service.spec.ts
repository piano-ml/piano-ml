import { TestBed } from '@angular/core/testing';

import { EngravingService } from './engraving.service';

describe('VexflowService', () => {
  let service: EngravingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EngravingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
