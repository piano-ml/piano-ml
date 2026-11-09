import * as Midi from '@tonejs/midi';
import { HandDetectorService } from './hand-detector.service';

describe('HandDetectorService', () => {
  it('should be created from a midi object', () => {
    const service = new HandDetectorService(new Midi.Midi(), false);

    expect(service).toBeTruthy();
  });
});
