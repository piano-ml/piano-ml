import { BeaconStep } from 'ng-beacon';

/** Shown the first time the timing calibration dialog opens. */
export const CALIBRATION_TOUR: BeaconStep[] = [
  {
    id: 'calibration-loopback',
    title: $localize`:@@latency.tour.loopback.title:Microphone hears the speakers`,
    content: $localize`:@@latency.tour.loopback.content:Your speakers or headphones always sound a little after a note is played. To score your playing against what you really hear, Piano ML plays a few clicks and listens to them with your microphone. That tells it how late the sound arrives.`,
    position: 'below',
    selector: '#calibration-loopback',
  },
  {
    id: 'calibration-calibrate',
    title: $localize`:@@latency.tour.calibrate.title:Calibrate`,
    content: $localize`:@@latency.tour.calibrate.content:Best done now, before you play: allow the microphone, then press Calibrate. It takes about 20 seconds.`,
    position: 'start', // beside it: the Allow button above stays in sight
    selector: '#calibration-calibrate',
  },
];
