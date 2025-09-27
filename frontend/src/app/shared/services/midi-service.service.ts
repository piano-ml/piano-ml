import { Injectable } from '@angular/core';
import type { MidiEvent, MidiStateEvent } from '../model/webmidi';

@Injectable({
  providedIn: 'root'
})
export class MidiServiceService {

  enabledInputDevices: Map<string, MIDIInput> = new Map()
  enabledOutputDevices: Map<string, MIDIOutput> = new Map()
  octave = 4
  pressedNotes = new Map<number, { time: number; vel: number }>()
  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  listeners: Array<Function> = []
  private midiSetupRetries = 0
  private readonly maxRetries = 3

  constructor() {
    this.onMidiMessage = this.onMidiMessage.bind(this);
    this.setupMidiDeviceListeners()
  }

  press(note: number, velocity: number) {
    const time = Date.now()
    this.pressedNotes.set(note, { time, vel: velocity })
    this.notify({ note, velocity, type: 'down', time })
  }

  pressOutput(note: number, volume: number) {
    for (const output of this.enabledOutputDevices) {
      const midiNoteOnCh1 = 144
      const velocity = volume * 127
      const data = [midiNoteOnCh1, note, velocity]
      output[1]?.send(data)
    }
  }

  release(note: number) {
    this.pressedNotes.delete(note)
    this.notify({ note, type: 'up', time: Date.now() })
  }

  releaseOutput(note: number) {
    const midiNoteOffCh1 = 128
    for (const output of this.enabledOutputDevices) {
      const data = [midiNoteOffCh1, note, 127]
      output[1]?.send(data)
    }
  }

  notify(e: MidiStateEvent) {
    // biome-ignore lint/complexity/noForEach: <explanation>
    this.listeners.forEach((fn) => fn(e))
  }

  subscribe(cb: (e: MidiStateEvent) => void) {
    this.listeners.push(cb)
    return cb;
  }

  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  unsubscribe(cb: Function) {
    const i = this.listeners.indexOf(cb)
    this.listeners.splice(i, 1)
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
    getMidiInputs().then((inputs) => {
      if (inputs.size === 0) {
        if (this.midiSetupRetries < this.maxRetries) {
          this.midiSetupRetries++;
          console.log(`No MIDI devices found. Retry attempt ${this.midiSetupRetries}/${this.maxRetries}`);
          setTimeout(() => {
            this.setupMidiDeviceListeners();
          }, 100);
        } else {
          console.warn(`No MIDI devices found after ${this.maxRetries} attempts. Stopping retry loop.`);
        }
        return;
      }
      
      // Reset retry counter on success
      this.midiSetupRetries = 0;
      for (const device of inputs.values()) {
        this.enableInputMidiDevice(device);
      }
    }).catch((error) => {
      console.error('Erreur lors de la configuration des appareils MIDI:', error);
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


  disableInputMidiDevice(deviceParam: MIDIInput) {
    const device = this.enabledInputDevices.get(deviceParam.id)
    if (!device) {
      return
    }
    device.removeEventListener('midimessage', this.onMidiMessage)
    device.close()
    this.enabledInputDevices.delete(device.id)
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
    return new Map()
  }
  try {
    const midiAccess = await navigator.requestMIDIAccess()
    return new Promise((resolve) => {
      const checkDevices = () => {
        const inputs = midiAccess.inputs as unknown as MIDIInputMap;
        if (inputs.size > 0 ) {
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
    return new Map()
  }
}
