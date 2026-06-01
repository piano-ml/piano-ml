import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { MidiEvent, MidiStateEvent } from '../model/webmidi';

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
  noteChannel = 144;
  drumChannel = 153;
  pressedNotes = new Map<number, { time: number; vel: number }>()
  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  private midiSetupRetries = 0
  private readonly maxRetries = 3

  // Signal pour émettre les événements MIDI
  public midiEvent = signal<MidiStateEvent | null>(null)

  constructor() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.onMidiMessage = this.onMidiMessage.bind(this);
  }

  /**
   * Midi out pressing note to connected output devices
   * @param note 
   * @param volume 
   */
  pressOutput(note: number, volume: number) {
    const velocity = volume * 127
    const data = [this.noteChannel, note, velocity]
    for (const output of this.enabledOutputDevices) {
      output[1]?.send(data)
    }
  }

  /**
   * Midi out releasing note to connected output devices
   * @param note 
   */
  releaseOutput(note: number) {
    for (const output of this.enabledOutputDevices) {
      const data = [this.noteChannel + 16, note, 127]
      output[1]?.send(data)
    }
  }


  pressDrum(note: number, volume: number) {
    const velocity = volume * 127
    const data = [this.drumChannel, note, velocity]
    for (const output of this.enabledOutputDevices) {
      output[1]?.send(data)
    }
  }

  /**
   * Midi out releasing note to connected output devices
   * @param note 
   */
  releaseDrum(note: number) {
    for (const output of this.enabledOutputDevices) {
      const data = [this.drumChannel + 16, note, 127]
      output[1]?.send(data)
    }
  }


  onMidiMessage(e: MIDIMessageEvent) {
    const msg: MidiEvent | null = parseMidiMessage(e)
    if (!msg) {
      return
    }

    const { note, velocity } = msg
    if (msg.type === 'on' && msg.velocity > 0) {
      this.press(note, velocity)
    } else {
      this.release(note)
    }
  }


  /**
   * Midi in event (press) to Angular signal from connected input devices
   * @param note 
   * @param velocity 
   */
  press(note: number, velocity: number) {
    const time = Date.now()
    this.pressedNotes.set(note, { time, vel: velocity })
    this.midiEvent.set({ note, velocity, type: 'down', time })
  }

  /**
   * Midi in event (release) to Angular signal from connected input devices
   * @param note 
   */
  release(note: number) {
    this.pressedNotes.delete(note)
    this.midiEvent.set({ note, type: 'up', time: Date.now() })
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
  return {
    type: command === 0x9 ? 'on' : 'off',
    note: data[1],
    velocity: data[2],
    timeStamp: event.timeStamp,
  }
}


export async function getMidiInputs(): Promise<MIDIInputMap> {
  const result = await navigator.permissions.query({ name: "midi" })
  if (result.state === "denied") {
    console.warn('Your browser is not allowing MIDI. Please consider enabling it in your browser settings.');
    throw new Error('MIDI permission denied');
  }
  try {
    const midiAccess = await navigator.requestMIDIAccess()
    return new Promise((resolve) => {
      const checkDevices = () => {
        const inputs = midiAccess.inputs as unknown as MIDIInputMap;
        if (inputs.size > 0) {
          resolve(inputs);
        } else {
          // Réessayer après un court délai
          setTimeout(checkDevices, 1000);
        }
      };
      midiAccess.addEventListener('statechange', checkDevices);

      // Vérifier immédiatement
      checkDevices();

      setTimeout(() => {
        midiAccess.removeEventListener('statechange', checkDevices);
        if (result.state !== "denied") {
          resolve(midiAccess.inputs as unknown as MIDIInputMap);
        }
      }, 2000);
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
