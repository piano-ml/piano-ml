import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MidiServiceService } from './midi-service.service';

/** A fake Web MIDI port: records what is sent, and can emit messages like a plugged keyboard. */
class FakePort extends EventTarget {
  sent: number[][] = [];
  state: 'open' | 'closed' = 'closed';
  version = '1';
  constructor(public id: string, public name: string, public manufacturer = 'Acme') { super(); }
  open() { this.state = 'open'; return Promise.resolve(this); }
  close() { this.state = 'closed'; return Promise.resolve(this); }
  send(data: number[]) { this.sent.push([...data]); }
  /** Emits a MIDI message, e.g. [0x90, 60, 100] = note on, middle C. */
  emit(data: number[]) {
    this.dispatchEvent(Object.assign(new Event('midimessage'), { data: new Uint8Array(data) }));
  }
}
const port = (id: string, name: string, manufacturer?: string) => new FakePort(id, name, manufacturer);
/** The same fake port, typed as the service expects it. */
const asIn = (p: FakePort) => p as unknown as MIDIInput;
const asOut = (p: FakePort) => p as unknown as MIDIOutput;

// MIDI status bytes (channel 1, and channel 10 for drums)
const NOTE_ON = 0x90, NOTE_OFF = 0x80, DRUM_ON = 0x99, DRUM_OFF = 0x89;

describe('MidiServiceService', () => {
  let midi: MidiServiceService;

  function create(platform = 'browser') {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    midi = TestBed.inject(MidiServiceService);
    return midi;
  }

  beforeEach(() => {
    localStorage.removeItem('midiInputDevicesEnabled');
    localStorage.removeItem('midiOutputDevicesEnabled');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  describe('MIDI output (the app playing on an external instrument)', () => {
    let synth: FakePort;
    beforeEach(() => {
      create();
      synth = port('out-1', 'Synth');
      midi.enableOutputMidiDevice(asOut(synth));
    });

    it('sends note on with the velocity scaled to 0-127', () => {
      midi.pressOutput(60, 1);
      midi.pressOutput(64, 0.5);
      expect(synth.sent).toEqual([[NOTE_ON, 60, 127], [NOTE_ON, 64, 63.5]]);
    });

    it('sends a real note off (0x80), so notes do not hang', () => {
      midi.releaseOutput(60);
      expect(synth.sent).toEqual([[NOTE_OFF, 60, 127]]);
    });

    it('plays metronome clicks on the drum channel (10)', () => {
      midi.pressDrum(34, 1);
      midi.releaseDrum(34);
      expect(synth.sent).toEqual([[DRUM_ON, 34, 127], [DRUM_OFF, 34, 127]]);
    });

    it('releases every note of every output between two scores', () => {
      midi.press(60, 100);
      midi.resetSessionOutputs();
      const offs = synth.sent.filter(([status]: number[]) => status === NOTE_OFF);
      expect(offs.length).toBe(129); // the pressed note, then all 128 notes
      expect(synth.sent.filter(([status]: number[]) => status === DRUM_OFF).length).toBe(129);
      expect(midi.pressedNotes.size).toBe(0);
      expect(midi.midiEvent()).toBeNull();
    });

    it('sends nothing once the output is disabled', () => {
      midi.disableOutputMidiDevice(asOut(synth));
      midi.pressOutput(60, 1);
      expect(synth.sent).toEqual([]);
      expect(synth.state).toBe('closed');
    });
  });

  describe('MIDI input (the user playing)', () => {
    let keyboard: FakePort;
    beforeEach(() => {
      create();
      keyboard = port('in-1', 'Digital Piano');
      midi.enableInputMidiDevice(asIn(keyboard));
    });

    it('turns a note on into a "down" event, with its velocity', () => {
      keyboard.emit([NOTE_ON, 60, 100]);
      expect(midi.midiEvent()).toMatchObject({ note: 60, velocity: 100, type: 'down' });
      expect(midi.pressedNotes.get(60)?.vel).toBe(100);
    });

    it('turns a note off, or a note on with velocity 0, into an "up" event', () => {
      keyboard.emit([NOTE_ON, 60, 100]);
      keyboard.emit([NOTE_OFF, 60, 64]);
      expect(midi.midiEvent()).toMatchObject({ note: 60, type: 'up' });
      keyboard.emit([NOTE_ON, 62, 100]);
      keyboard.emit([NOTE_ON, 62, 0]);
      expect(midi.midiEvent()).toMatchObject({ note: 62, type: 'up' });
      expect(midi.pressedNotes.size).toBe(0);
    });

    it.each([
      ['sustain pedal', [0xb0, 64, 127]],
      ['modulation wheel', [0xb0, 1, 90]],
      ['polyphonic aftertouch', [0xa0, 60, 30]],
    ])('ignores the %s (not a key release)', (_name, message) => {
      keyboard.emit([NOTE_ON, 64, 100]); // E4 held
      keyboard.emit(message);
      expect(midi.pressedNotes.has(64)).toBe(true);
      expect(midi.midiEvent()).toMatchObject({ note: 64, type: 'down' });
    });

    it('ignores messages that are not 3 bytes long', () => {
      keyboard.emit([0xf8]); // MIDI clock
      expect(midi.midiEvent()).toBeNull();
    });

    it('stops listening once the input is disabled', () => {
      midi.disableInputMidiDevice(asIn(keyboard));
      keyboard.emit([NOTE_ON, 60, 100]);
      expect(midi.midiEvent()).toBeNull();
      expect(midi.isInputMidiDeviceEnabled(asIn(keyboard))).toBe(false);
      midi.disableInputMidiDevice(asIn(keyboard)); // already disabled: nothing to do
    });
  });

  describe('choosing devices (remembered in localStorage)', () => {
    beforeEach(() => create());

    it('selects everything until the user chooses', () => {
      expect(midi.isInputDeviceSelected(asIn(port('in-1', 'Piano')))).toBe(true);
      expect(midi.isOutputDeviceSelected(asOut(port('out-1', 'Synth')))).toBe(true);
      expect(midi.isOutputDeviceSelected(null)).toBe(true);
    });

    it('enables one input at a time and remembers it by manufacturer and name', () => {
      const a = port('in-a', 'Piano A', 'Yamaha');
      const b = port('in-b', 'Piano B', 'Roland');
      midi.setInputDeviceEnabled(asIn(a), true);
      midi.setInputDeviceEnabled(asIn(b), true);
      expect([midi.isInputMidiDeviceEnabled(asIn(a)), midi.isInputMidiDeviceEnabled(asIn(b))]).toEqual([false, true]);
      expect(JSON.parse(localStorage.getItem('midiInputDevicesEnabled')!)).toEqual(['roland::piano b']);
      expect(midi.isInputDeviceSelected(asIn(a))).toBe(false);
      expect(midi.isInputDeviceSelected(asIn(port('other-id', 'Piano B', 'Roland')))).toBe(true); // same device, new id
    });

    it('can disable an input', () => {
      const a = port('in-a', 'Piano A');
      midi.setInputDeviceEnabled(asIn(a), true);
      midi.setInputDeviceEnabled(asIn(a), false);
      expect(midi.isInputMidiDeviceEnabled(asIn(a))).toBe(false);
      expect(JSON.parse(localStorage.getItem('midiInputDevicesEnabled')!)).toEqual([]);
    });

    it('identifies a nameless device by its id', () => {
      const anonymous = port('id-42', '', '');
      midi.setInputDeviceEnabled(asIn(anonymous), true);
      expect(JSON.parse(localStorage.getItem('midiInputDevicesEnabled')!)).toEqual(['id-42']);
    });

    it('enables one output at a time, or PianoML itself', () => {
      const synth = port('out-1', 'Synth');
      midi.setOutputDeviceEnabled(asOut(synth), true);
      expect(midi.pianoMLShouldPlay()).toBe(false);
      midi.setOutputDeviceEnabled(null as unknown as MIDIOutput, true); // PianoML plays the piano itself
      expect(midi.pianoMLShouldPlay()).toBe(true);
      expect(midi.enabledOutputDevices.size).toBe(0);
      midi.pressOutput(60, 1);
      expect(synth.sent).toEqual([]);
    });

    it('can disable an output', () => {
      const synth = port('out-1', 'Synth');
      midi.setOutputDeviceEnabled(asOut(synth), true);
      midi.setOutputDeviceEnabled(asOut(synth), false);
      expect(midi.enabledOutputDevices.size).toBe(0);
    });

    it('ignores a corrupted stored selection', () => {
      localStorage.setItem('midiInputDevicesEnabled', '{broken');
      expect(midi.isInputDeviceSelected(asIn(port('in-1', 'Piano')))).toBe(true);
      localStorage.setItem('midiInputDevicesEnabled', '"not a list"');
      expect(midi.isInputDeviceSelected(asIn(port('in-1', 'Piano')))).toBe(true);
    });
  });

  describe('connecting to the devices (setupMidiDeviceListeners)', () => {
    let access: EventTarget & { inputs: Map<string, MIDIInput>; outputs: Map<string, MIDIOutput> };
    let permission: PermissionState;

    beforeEach(() => {
      access = Object.assign(new EventTarget(), { inputs: new Map(), outputs: new Map() });
      permission = 'granted';
      vi.spyOn(navigator.permissions, 'query').mockImplementation(async () => ({ state: permission }) as PermissionStatus);
      vi.spyOn(navigator, 'requestMIDIAccess').mockImplementation(async () => access as unknown as MIDIAccess);
      create();
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

    it('connects the keyboard, preferring a real port over "through" ports, and lets PianoML play', async () => {
      const through = port('in-0', 'Midi Through Port-0');
      const piano = port('in-1', 'Digital Piano');
      access.inputs.set('in-0', asIn(through)).set('in-1', asIn(piano));
      midi.setupMidiDeviceListeners();
      await settle();
      expect(midi.availableInputs).toHaveLength(2);
      expect(midi.isInputMidiDeviceEnabled(asIn(piano))).toBe(true);
      expect(midi.isInputMidiDeviceEnabled(asIn(through))).toBe(false);
      expect(midi.pianoMLShouldPlay()).toBe(true); // default output
    });

    it('restores the remembered output', async () => {
      const synth = port('out-1', 'Synth');
      access.inputs.set('in-1', asIn(port('in-1', 'Piano')));
      access.outputs.set('out-1', asOut(synth));
      localStorage.setItem('midiOutputDevicesEnabled', JSON.stringify(['acme::synth']));
      midi.setupMidiDeviceListeners();
      await settle();
      expect(midi.enabledOutputDevices.get('out-1')).toBe(asOut(synth));
      expect(midi.availableOutputs).toEqual([asOut(synth)]);
    });

    it('gives up after a few retries when MIDI is blocked', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      permission = 'denied';
      vi.useFakeTimers();
      midi.setupMidiDeviceListeners();
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(600);
      expect(navigator.permissions.query).toHaveBeenCalledTimes(4); // first try + 3 retries
      expect(console.error).toHaveBeenCalledWith('MIDI setup failed after 3 attempts. Stopping retry loop.');
      vi.useRealTimers();
    });

    it('does nothing during server-side rendering', () => {
      TestBed.resetTestingModule();
      create('server');
      midi.setupMidiDeviceListeners();
      expect(navigator.permissions.query).not.toHaveBeenCalled();
    });
  });
});
