import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { MidiEvent, MidiStateEvent } from '../model/webmidi';

/** Shown when the browser denies MIDI access to the site: by the workbench setup panel and the /work popup. */
export const MIDI_BLOCKED_MESSAGE = $localize`:@@midiSetup.error.blocked:MIDI access is blocked by your browser. Please open your browser settings, find site permissions for MIDI, allow access for this site, then reload the page.`;

/**
 * The browser's MIDI permission status, or null where it cannot be queried
 * (server rendering, no Permissions API, or a browser that does not know the "midi" permission).
 */
export async function queryMidiPermission(): Promise<PermissionStatus | null> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) return null;
  try {
    return await navigator.permissions.query({ name: 'midi' as PermissionName });
  } catch {
    return null;
  }
}

@Injectable({
  providedIn: 'root'
})
export class MidiServiceService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  private readonly midiInputStorageKey = 'midiInputDevicesEnabled';
  private readonly midiOutputStorageKey = 'midiOutputDevicesEnabled';

  enabledInputDevices: Map<string, MIDIInput> = new Map()
  enabledOutputDevices: Map<string, MIDIOutput> = new Map()
  availableInputs: MIDIInput[] = []
  availableOutputs: MIDIOutput[] = []
  octave = 4
  noteChannel = 144; // 0x90: note on, channel 1
  drumChannel = 153; // 0x99: note on, channel 10 (drums)
  /** Note off is 0x80 + channel: 16 below note on (+16 would be 0xA0, polyphonic aftertouch, and notes would hang). */
  private static readonly NOTE_OFF_OFFSET = -16;
  pressedNotes = new Map<number, { time: number; vel: number }>()
  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  private midiSetupRetries = 0
  private readonly maxRetries = 3

  // Signal pour émettre les événements MIDI
  public midiEvent = signal<MidiStateEvent | null>(null)
  /** See addNoteListener(). */
  private readonly noteListeners = new Set<(event: MidiStateEvent) => void>()
  /** Set when the browser refused MIDI access (permission denied or not granted): pages tell the user how to allow it. */
  public readonly midiBlocked = signal(false)

  constructor() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.onMidiMessage = this.onMidiMessage.bind(this);
  }

  /**
   * Midi out pressing note to connected output devices.
   * `atMs` (performance.now() time) lets the browser send it at that moment instead of right away: the player
   * schedules a little ahead, like the synth.
   */
  pressOutput(note: number, volume: number, atMs?: number) {
    this.send([this.noteChannel, note, volume * 127], atMs)
  }

  /** Midi out releasing note to connected output devices (`atMs`: see pressOutput). */
  releaseOutput(note: number, atMs?: number) {
    this.send([this.noteChannel + MidiServiceService.NOTE_OFF_OFFSET, note, 127], atMs)
  }

  pressDrum(note: number, volume: number, atMs?: number) {
    this.send([this.drumChannel, note, volume * 127], atMs)
  }

  /** Midi out releasing a drum (`atMs`: see pressOutput). */
  releaseDrum(note: number, atMs?: number) {
    this.send([this.drumChannel + MidiServiceService.NOTE_OFF_OFFSET, note, 127], atMs)
  }

  private send(data: number[], atMs?: number) {
    for (const output of this.enabledOutputDevices) {
      if (atMs === undefined) {
        output[1]?.send(data)
      } else {
        output[1]?.send(data, atMs)
      }
    }
  }


  onMidiMessage(e: MIDIMessageEvent) {
    const msg: MidiEvent | null = parseMidiMessage(e)
    if (!msg) {
      return
    }

    const { note, velocity } = msg
    // A fake or replayed message may have no timestamp: now, then
    const timeStamp = msg.timeStamp > 0 ? msg.timeStamp : performance.now()
    if (msg.type === 'on' && msg.velocity > 0) {
      this.press(note, velocity, timeStamp)
    } else {
      this.release(note, timeStamp)
    }
  }


  /**
   * Midi in event (press) to Angular signal from connected input devices
   * @param note 
   * @param velocity 
   */
  press(note: number, velocity: number, timeStamp: number = performance.now()) {
    const time = Date.now()
    this.pressedNotes.set(note, { time, vel: velocity })
    this.emit({ note, velocity, type: 'down', time, timeStamp })
  }

  /**
   * Midi in event (release) to Angular signal from connected input devices
   * @param note 
   */
  release(note: number, timeStamp: number = performance.now()) {
    this.pressedNotes.delete(note)
    this.emit({ note, type: 'up', time: Date.now(), timeStamp })
  }

  /**
   * Called synchronously for every key press and release: unlike the midiEvent signal, nothing is coalesced or
   * delayed to the next change detection. Returns the function that unsubscribes the listener.
   */
  addNoteListener(listener: (event: MidiStateEvent) => void): () => void {
    this.noteListeners.add(listener)
    return () => this.noteListeners.delete(listener)
  }

  /** Listeners first, in the same task as the key press; then the signal, for the pages that only display it. */
  private emit(event: MidiStateEvent): void {
    for (const listener of this.noteListeners) {
      listener(event)
    }
    this.midiEvent.set(event)
  }


  setupMidiDeviceListeners() {
    if (!this.isBrowser) {
      console.log('MIDI setup skipped on server');
      return;
    }
    getMidiInputs().then((inputs) => {
      this.availableInputs = Array.from(inputs.values());
      if (inputs.size === 0) {
        if (this.midiSetupRetries < this.maxRetries) {
          this.midiSetupRetries++;
          console.log(`No MIDI devices found. Retry attempt ${this.midiSetupRetries}/${this.maxRetries}`);
          setTimeout(() => {
            try {
              this.setupMidiDeviceListeners();
            } catch (error) {
              this.midiSetupRetries = 1000;
              console.error('Error during MIDI setup retry:', error);
            }

          }, 100);
        } else {
          console.warn(`No MIDI devices found after ${this.maxRetries} attempts. Stopping retry loop.`);
        }
        return;
      }

      this.ensureDefaultSelections(inputs, this.enabledOutputDevices);

      // Reset retry counter on success
      //this.midiSetupRetries = 0;
      for (const device of inputs.values()) {
        if (this.isInputDeviceSelected(device)) {
          this.enableInputMidiDevice(device);
        } else {
          this.disableInputMidiDevice(device);
        }
      }
    }).catch((error) => {
      console.error('Erreur lors de la configuration des appareils MIDI:', error);
      //if (false) {
      if (this.midiSetupRetries < this.maxRetries) {
        this.midiSetupRetries++;
        console.log(`MIDI setup error. Retry attempt ${this.midiSetupRetries}/${this.maxRetries}`);
        setTimeout(() => {
          this.setupMidiDeviceListeners();
        }, 500);
      } else {
        console.error(`MIDI setup failed after ${this.maxRetries} attempts. Stopping retry loop.`);
        if (isMidiPermissionError(error)) {
          this.midiBlocked.set(true);
        }
      }
    });

    getMidiOutputs().then((outputs) => {
      this.availableOutputs = Array.from(outputs.values());
      this.ensureDefaultSelections(this.enabledInputDevices, outputs);
      for (const device of outputs.values()) {
        if (this.isOutputDeviceSelected(device)) {
          this.enableOutputMidiDevice(device);
        } else {
          this.disableOutputMidiDevice(device);
        }
      }
      if (this.enabledOutputDevices.size === 0) {
        this.setOutputDeviceEnabled(null as unknown as MIDIOutput, true);
      }
    });
  }

  resetSessionOutputs(): void {
    // Ensure no stuck external notes remain between two score sessions.
    for (const note of this.pressedNotes.keys()) {
      this.releaseOutput(note);
      this.releaseDrum(note);
    }

    // Best-effort panic for devices that may have missed note-off events.
    for (let midiNote = 0; midiNote < 128; midiNote++) {
      this.releaseOutput(midiNote);
      this.releaseDrum(midiNote);
    }

    this.pressedNotes.clear();
    this.midiEvent.set(null);
  }

  enableInputMidiDevice(device: MIDIInput) {

    device.open()
    device.addEventListener('midimessage', this.onMidiMessage)
    this.enabledInputDevices.set(device.id, device)
    console.log(`Enabled MIDI input device: ${device.manufacturer} ${device.name} ${device.version} `)

  }

  isInputMidiDeviceEnabled(device: MIDIInput) {
    return this.enabledInputDevices.has(device.id)
  }

  isInputDeviceSelected(device: MIDIInput) {
    const selected = this.getStoredDeviceSelection(this.midiInputStorageKey);
    if (!selected) return true;
    return selected.has(this.getDeviceKey(device));
  }


  disableInputMidiDevice(deviceParam: MIDIInput) {

    const device = this.enabledInputDevices.get(deviceParam.id)
    if (!device) {
      return
    }
    device.removeEventListener('midimessage', this.onMidiMessage)
    device.close()
    this.enabledInputDevices.delete(device.id)
  }

  setInputDeviceEnabled(device: MIDIInput, enabled: boolean) {

    if (enabled) {
      this.updateStoredDeviceSelection(this.midiInputStorageKey, this.getDeviceKey(device), true, new Set([this.getDeviceKey(device)]));
      this.disableAllInputsExcept(device);
      this.enableInputMidiDevice(device);
    } else {
      this.updateStoredDeviceSelection(this.midiInputStorageKey, this.getDeviceKey(device), false, new Set());
      this.disableInputMidiDevice(device);
    }
  }

  enableOutputMidiDevice(device: MIDIOutput) {
    if (device === null) {
      return
    }
    device.open()
    this.enabledOutputDevices.set(device.id, device)
    console.log(`Enabled MIDI output device: ${device.manufacturer} ${device.name} ${device.version} `)
  }

  disableOutputMidiDevice(deviceParam: MIDIOutput) {
    if (deviceParam === null) {
      return
    }
    const device = this.enabledOutputDevices.get(deviceParam.id)
    if (!device) {
      return
    }
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    device.removeEventListener('midimessage', this.onMidiMessage as any)
    device.close()
    this.enabledOutputDevices.delete(device.id)
  }

  isOutputDeviceSelected(device: MIDIOutput | null) {
    const selected = this.getStoredDeviceSelection(this.midiOutputStorageKey);
    if (device === null) {
      return true;
    }

    if (!selected) return true;
    return selected.has(this.getDeviceKey(device as MIDIOutput));
  }

  pianoMLShouldPlay() {
    const selected = this.getStoredDeviceSelection(this.midiOutputStorageKey) || new Set<string>();
    return selected.has('PIANOML');
  }


  setOutputDeviceEnabled(device: MIDIOutput, enabled: boolean) {

    if (enabled) {
      this.disableAllOutputsExcept(device);
      this.enableOutputMidiDevice(device);
      this.updateStoredDeviceSelection(this.midiOutputStorageKey, this.getDeviceKey(device), true, new Set([this.getDeviceKey(device)]));
    } else {
      this.disableOutputMidiDevice(device);
    }
  }

  private getDeviceKey(device: MIDIInput | MIDIOutput) {
    if (device === null) {
      return 'PIANOML'; // null device case
    }
    const manufacturer = (device.manufacturer ?? '').trim();
    const name = (device.name ?? '').trim();
    if (name || manufacturer) {
      return `${manufacturer}::${name}`.toLowerCase();
    }
    return device.id;
  }

  private getStoredDeviceSelection(storageKey: string): Set<string> | null {
    if (!this.isBrowser) return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    } catch {
      return null;
    }
    return null;
  }

  private hasStoredDeviceSelection(storageKey: string) {
    if (!this.isBrowser) return false;
    return localStorage.getItem(storageKey) !== null;
  }

  private updateStoredDeviceSelection(storageKey: string, deviceKey: string, enabled: boolean, seed?: Set<string>) {

    const selected = seed ?? this.getStoredDeviceSelection(storageKey) ?? new Set<string>();

    if (enabled) {
      selected.add(deviceKey);
    } else {
      selected.delete(deviceKey);
    }
    localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
  }

  private disableAllInputsExcept(selected: MIDIInput) {
    for (const device of this.enabledInputDevices.values()) {
      if (device.id !== selected.id) {
        this.disableInputMidiDevice(device);
      }
    }
  }

  private disableAllOutputsExcept(selected: MIDIOutput) {
    for (const device of this.enabledOutputDevices.values()) {
      if (selected == null || device.id !== selected.id) {
        this.disableOutputMidiDevice(device);
      }
    }
  }

  private ensureDefaultSelections(
    inputs: MIDIInputMap | Map<string, MIDIInput>,
    outputs: MIDIOutputMap | Map<string, MIDIOutput>
  ) {

    if (!this.hasStoredDeviceSelection(this.midiInputStorageKey)) {

      const inputList = Array.from(inputs.values());
      const preferredInput = this.pickPreferredInput(inputList);
      if (preferredInput) {
        localStorage.setItem(this.midiInputStorageKey, JSON.stringify([this.getDeviceKey(preferredInput)]));
      }
    }

    if (!this.hasStoredDeviceSelection(this.midiOutputStorageKey)) {
      const inputKeys = new Set(
        Array.from(inputs.values()).map(device => this.getDeviceKey(device))
      );
      localStorage.setItem(this.midiOutputStorageKey, JSON.stringify(["PIANOML"]));
    }
  }

  private pickPreferredInput(inputs: MIDIInput[]) {
    if (!inputs.length) return null;
    const nonThrough = inputs.find(device => !this.isThroughPort(device.name));
    return nonThrough ?? inputs[0];
  }

  private pickPreferredOutput(outputs: MIDIOutput[], inputKeys: Set<string>) {
    if (!outputs.length) return null;
    // const nonThrough = outputs.find(device => !this.isThroughPort(device.name) && !inputKeys.has(this.getDeviceKey(device)));
    // if (nonThrough) return nonThrough;
    // const fallback = outputs.find(device => !inputKeys.has(this.getDeviceKey(device)));
    // return fallback ?? outputs[0];
    return ["PIANOML"];
  }

  private isThroughPort(name?: string | null) {
    return (name ?? '').toLowerCase().includes('through') || (name ?? '').toLowerCase().includes('system');
  }


}


function parseMidiMessage(event: MIDIMessageEvent): MidiEvent | null {
  const data = event.data
  if (data?.length !== 3) {
    return null
  }

  const status = data[0]
  const command = status >>> 4
  // Only note on (0x9) and note off (0x8): control changes (sustain pedal, mod wheel...) and aftertouch
  // used to be read as a note off, releasing the note whose number matched the controller or pressure.
  if (command !== 0x9 && command !== 0x8) {
    return null
  }
  return {
    type: command === 0x9 ? 'on' : 'off',
    note: data[1],
    velocity: data[2],
    timeStamp: event.timeStamp,
  }
}


/** A refusal of MIDI access by the browser or the user, as opposed to an unsupported browser or a device failure. */
export function isMidiPermissionError(error: unknown): boolean {
  if (error instanceof Error && error.message === 'MIDI permission denied') return true;
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

/** getMidiInputs() looks for a connected keyboard this often... */
const MIDI_INPUT_POLL_MS = 1000;
/** ...for this long, then answers with what it found (maybe nothing). */
const MIDI_INPUT_WAIT_MS = 2000;

export async function getMidiInputs(): Promise<MIDIInputMap> {
  const result = await navigator.permissions.query({ name: "midi" })
  if (result.state === "denied") {
    console.warn('Your browser is not allowing MIDI. Please consider enabling it in your browser settings.');
    throw new Error('MIDI permission denied');
  }
  try {
    const midiAccess = await navigator.requestMIDIAccess()
    return new Promise((resolve) => {
      const inputs = () => midiAccess.inputs as unknown as MIDIInputMap;
      let settled = false;
      let poll: ReturnType<typeof setTimeout> | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      // Answers once, and stops looking: the polling used to go on forever without a keyboard (one loop per setup
      // attempt), waking the page, and Angular's change detection, every second.
      const finish = () => {
        settled = true;
        clearTimeout(poll);
        clearTimeout(deadline);
        midiAccess.removeEventListener('statechange', checkDevices);
        resolve(inputs());
      };
      const checkDevices = () => {
        if (settled) return;
        if (inputs().size > 0) {
          finish();
        } else {
          // Réessayer après un court délai
          clearTimeout(poll);
          poll = setTimeout(checkDevices, MIDI_INPUT_POLL_MS);
        }
      };
      midiAccess.addEventListener('statechange', checkDevices);
      deadline = setTimeout(finish, MIDI_INPUT_WAIT_MS);

      // Vérifier immédiatement
      checkDevices();
    });


  } catch (error) {
    console.warn(`Error accessing MIDI devices: ${error}`)
    throw error;
  }
}

export async function getMidiOutputs(): Promise<MIDIOutputMap> {
  if (!window.navigator.requestMIDIAccess) {
    return new Map()
  }

  try {
    const midiAccess = await window.navigator.requestMIDIAccess()
    return midiAccess.outputs as MIDIOutputMap
  } catch (error) {
    console.error(`Error accessing MIDI devices: ${error}`)
    return new Map()
  }
}
