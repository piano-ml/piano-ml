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
  private availableInputs: MIDIInput[] = []
  private availableOutputs: MIDIOutput[] = []
  octave = 4
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

  press(note: number, velocity: number) {
    if (!this.isBrowser) return;
    const time = Date.now()
    this.pressedNotes.set(note, { time, vel: velocity })
    this.notify({ note, velocity, type: 'down', time })
  }

  pressOutput(note: number, volume: number) {
    if (!this.isBrowser) return;
    for (const output of this.enabledOutputDevices) {
      const midiNoteOnCh1 = 144
      const velocity = volume * 127
      const data = [midiNoteOnCh1, note, velocity]
      output[1]?.send(data)
    }
  }

  release(note: number) {
    if (!this.isBrowser) return;
    this.pressedNotes.delete(note)
    this.notify({ note, type: 'up', time: Date.now() })
  }

  releaseOutput(note: number) {
    if (!this.isBrowser) return;
    const midiNoteOffCh1 = 128
    for (const output of this.enabledOutputDevices) {
      const data = [midiNoteOffCh1, note, 127]
      output[1]?.send(data)
    }
  }

  notify(e: MidiStateEvent) {
    // Émettre via le signal
    this.midiEvent.set(e);
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
      if (false) {
        //if (this.midiSetupRetries < this.maxRetries) {
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
    });
  }

  enableInputMidiDevice(device: MIDIInput) {
    if (!this.isBrowser) return;
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
    if (!this.isBrowser) return;
    const device = this.enabledInputDevices.get(deviceParam.id)
    if (!device) {
      return
    }
    device.removeEventListener('midimessage', this.onMidiMessage)
    device.close()
    this.enabledInputDevices.delete(device.id)
  }

  setInputDeviceEnabled(device: MIDIInput, enabled: boolean) {
    if (!this.isBrowser) return;
    if (enabled) {
      this.updateStoredDeviceSelection(this.midiInputStorageKey, this.getDeviceKey(device), true, new Set([this.getDeviceKey(device)]));
      this.updateStoredDeviceSelection(this.midiOutputStorageKey, this.getDeviceKey(device), false);
      this.disableOutputByKey(this.getDeviceKey(device));
      const fallbackOutput = this.getFirstAvailableOutputExcluding(this.getDeviceKey(device));
      if (fallbackOutput) {
        this.updateStoredDeviceSelection(this.midiOutputStorageKey, this.getDeviceKey(fallbackOutput), true, new Set([this.getDeviceKey(fallbackOutput)]));
        this.disableAllOutputsExcept(fallbackOutput);
        this.enableOutputMidiDevice(fallbackOutput);
      }
      this.disableAllInputsExcept(device);
      this.enableInputMidiDevice(device);
    } else {
      this.updateStoredDeviceSelection(this.midiInputStorageKey, this.getDeviceKey(device), false, new Set());
      this.disableInputMidiDevice(device);
    }
  }

  enableOutputMidiDevice(device: MIDIOutput) {
    device.open()
    this.enabledOutputDevices.set(device.id, device)
    console.log(`Enabled MIDI output device: ${device.manufacturer} ${device.name} ${device.version} `)
  }

  disableOutputMidiDevice(deviceParam: MIDIOutput) {
    const device = this.enabledOutputDevices.get(deviceParam.id)
    if (!device) {
      return
    }
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    device.removeEventListener('midimessage', this.onMidiMessage as any)
    device.close()
    this.enabledOutputDevices.delete(device.id)
  }

  isOutputDeviceSelected(device: MIDIOutput) {
    const selected = this.getStoredDeviceSelection(this.midiOutputStorageKey);
    if (!selected) return true;
    return selected.has(this.getDeviceKey(device));
  }

  setOutputDeviceEnabled(device: MIDIOutput, enabled: boolean) {
    if (!this.isBrowser) return;
    if (enabled) {
      this.updateStoredDeviceSelection(this.midiOutputStorageKey, this.getDeviceKey(device), true, new Set([this.getDeviceKey(device)]));
      this.updateStoredDeviceSelection(this.midiInputStorageKey, this.getDeviceKey(device), false);
      this.disableInputByKey(this.getDeviceKey(device));
      const fallbackInput = this.getFirstAvailableInputExcluding(this.getDeviceKey(device));
      if (fallbackInput) {
        this.updateStoredDeviceSelection(this.midiInputStorageKey, this.getDeviceKey(fallbackInput), true, new Set([this.getDeviceKey(fallbackInput)]));
        this.disableAllInputsExcept(fallbackInput);
        this.enableInputMidiDevice(fallbackInput);
      }
      this.disableAllOutputsExcept(device);
      this.enableOutputMidiDevice(device);
    } else {
      this.updateStoredDeviceSelection(this.midiOutputStorageKey, this.getDeviceKey(device), false, new Set());
      this.disableOutputMidiDevice(device);
    }
  }

  private getDeviceKey(device: MIDIInput | MIDIOutput) {
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
    if (!this.isBrowser) return;
    const selected = seed ?? this.getStoredDeviceSelection(storageKey) ?? new Set<string>();
    if (enabled) {
      selected.add(deviceKey);
    } else {
      selected.delete(deviceKey);
    }
    localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
  }

  private getCurrentEnabledInputKeys() {
    return new Set(Array.from(this.enabledInputDevices.values()).map(device => this.getDeviceKey(device)));
  }

  private getCurrentEnabledOutputKeys() {
    return new Set(Array.from(this.enabledOutputDevices.values()).map(device => this.getDeviceKey(device)));
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
      if (device.id !== selected.id) {
        this.disableOutputMidiDevice(device);
      }
    }
  }

  private disableInputByKey(deviceKey: string) {
    for (const device of this.enabledInputDevices.values()) {
      if (this.getDeviceKey(device) === deviceKey) {
        this.disableInputMidiDevice(device);
      }
    }
  }

  private disableOutputByKey(deviceKey: string) {
    for (const device of this.enabledOutputDevices.values()) {
      if (this.getDeviceKey(device) === deviceKey) {
        this.disableOutputMidiDevice(device);
      }
    }
  }

  private getFirstAvailableOutputExcluding(excludedKey: string) {
    return this.availableOutputs.find(device => this.getDeviceKey(device) !== excludedKey) ?? null;
  }

  private getFirstAvailableInputExcluding(excludedKey: string) {
    return this.availableInputs.find(device => this.getDeviceKey(device) !== excludedKey) ?? null;
  }

  private ensureDefaultSelections(
    inputs: MIDIInputMap | Map<string, MIDIInput>,
    outputs: MIDIOutputMap | Map<string, MIDIOutput>
  ) {
    if (!this.isBrowser) return;

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
      const outputList = Array.from(outputs.values());
      const preferredOutput = this.pickPreferredOutput(outputList, inputKeys);
      if (preferredOutput) {
        localStorage.setItem(this.midiOutputStorageKey, JSON.stringify([this.getDeviceKey(preferredOutput)]));
      }
    }
  }

  private pickPreferredInput(inputs: MIDIInput[]) {
    if (!inputs.length) return null;
    const nonThrough = inputs.find(device => !this.isThroughPort(device.name));
    return nonThrough ?? inputs[0];
  }

  private pickPreferredOutput(outputs: MIDIOutput[], inputKeys: Set<string>) {
    if (!outputs.length) return null;
    const nonThrough = outputs.find(device => !this.isThroughPort(device.name) && !inputKeys.has(this.getDeviceKey(device)));
    if (nonThrough) return nonThrough;
    const fallback = outputs.find(device => !inputKeys.has(this.getDeviceKey(device)));
    return fallback ?? outputs[0];
  }

  private isThroughPort(name?: string | null) {
    return (name ?? '').toLowerCase().includes('through');
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
    alert(`Your browser is not allowing MIDI. Please consider enabling it in your browser settings.`);
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
    alert(`Error accessing MIDI devices: ${error}`)
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
