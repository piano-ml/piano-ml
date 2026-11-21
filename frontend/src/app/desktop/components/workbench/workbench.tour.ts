import { BeaconStep } from 'ng-beacon';

export const WORKBENCH_TOUR: BeaconStep[] = [
  {
    id: 'welcome',
    title: $localize`:@@workbench.tour.welcome.title:Welcome to the Workbench!`,
    content: $localize`:@@workbench.tour.welcome.content:This is where you can practice and learn your favorite piano pieces. Let me show you around the controls.`,
    position: 'center',
    showWithoutTarget: true,
  },
  {
    id: 'play-pause',
    title: $localize`:@@workbench.tour.playPause.title:Play / Pause`,
    content: $localize`:@@workbench.tour.playPause.content:Start or pause the playback and MIDI monitoring. You can also click on the score itself to toggle playback.`,
    position: 'below',
    selector: '#play-pause',
  },

  {
    id: 'right-hand',
    title: $localize`:@@workbench.tour.rightHand.title:Right Hand Practice`,
    content: $localize`:@@workbench.tour.rightHand.content:Choose how you play the right hand: Wait for me (the score waits for each of your notes, great for learning the melody at your own pace), Play along (the score keeps the tempo and the app stays silent for these notes) or App plays.`,
    position: 'below',
    selector: '#right-hand',
  },
  {
    id: 'left-hand',
    title: $localize`:@@workbench.tour.leftHand.title:Left Hand Practice`,
    content: $localize`:@@workbench.tour.leftHand.content:The same for the left hand. Choose Wait for me, or Play along, on both hands for hands-together practice.`,
    position: 'below',
    selector: '#left-hand',
  },
  {
    id: 'loop',
    title: $localize`:@@workbench.tour.loop.title:Loop Mode`,
    content: $localize`:@@workbench.tour.loop.content:When enabled, the selected range (or the entire piece) will repeat automatically, allowing for continuous practice.`,
    position: 'below',
    selector: '#loop',
  },
  {
    id: 'showTempo',
    title: $localize`:@@workbench.tour.showTempo.title:Tempo & Metronome`,
    content: $localize`:@@workbench.tour.showTempo.content:Adjust the playback speed to match your current skill level. You can also toggle the metronome on or off from here.`,
    position: 'below',
    selector: '#showTempo',
  },
  {
    id: 'midi-setup',
    title: $localize`:@@workbench.tour.midiSetup.title:MIDI & Display Setup`,
    content: $localize`:@@workbench.tour.midiSetup.content:Configure your MIDI input and output devices here. You can also toggle display options like the virtual keyboard, fingering, lyrics, and harmony indicators.`,
    position: 'below',
    selector: '#midi-setup',
  },
  {
    id: 'reset-score',
    title: $localize`:@@workbench.tour.resetScore.title:Reset Playback`,
    content: $localize`:@@workbench.tour.resetScore.content:One click returns you to the beginning of your selected range. A second click resets the score back to the very beginning.`,
    position: 'below',
    selector: '#reset-score',
  },
  {
    id: 'score-info',
    title: $localize`:@@workbench.tour.scoreInfo.title:Score Information`,
    content: $localize`:@@workbench.tour.scoreInfo.content:Need to check the details of this piece? Click here to go back to the score information page.`,
    position: 'below',
    selector: '#score-info',
  },

  {
    id: 'fullscreen',
    title: $localize`:@@workbench.tour.fullscreen.title:Fullscreen Toggle`,
    content: $localize`:@@workbench.tour.fullscreen.content:Maximize your workspace by entering fullscreen mode. Perfect for focusing entirely on the music.`,
    position: 'below',
    selector: '#fullscreen',
  },
  {
    id: 'measure-range',
    title: $localize`:@@workbench.tour.measureRange.title:Measure Selection`,
    content: $localize`:@@workbench.tour.measureRange.content:Use this slider to focus on specific measures. Drag the handles to set your practice range.`,
    position: 'below',
    selector: '#measure-range',
  },
  {
    id: 'toggle-keyboard',
    title: $localize`:@@workbench.tour.toggleKeyboard.title:Show/Hide Keyboard`,
    content: $localize`:@@workbench.tour.toggleKeyboard.content:Toggle the virtual piano keyboard at the bottom of the screen. It highlights notes as they are played.`,
    position: 'above',
    selector: '#toggle-keyboard',
  },
];
