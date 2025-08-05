import { TestBed } from '@angular/core/testing';

import { MidiServiceService } from './midi-service.service';

describe('MidiServiceService', () => {
  let service: MidiServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MidiServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
