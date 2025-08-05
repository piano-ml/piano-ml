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
    const inputs = getMidiInputs().then((inputs) => {
      for (const device of inputs.values()) {
        this.enableInputMidiDevice( device)
      }
    })
  }

  enableInputMidiDevice(device: MIDIInput) {
    device.open()
    device.addEventListener('midimessage', this.onMidiMessage)
    this.enabledInputDevices.set(device.id, device)
  }

  isInputMidiDeviceEnabled(device: MIDIInput) {
    return this.enabledInputDevices.has(device.id)
  }
  
  isOutputMidiDeviceEnabled(device: MIDIOutput) {
    return this.enabledOutputDevices.has(device.id)
  }
  

  
  enableOutputMidiDevice(device: MIDIOutput) {
    device.open()
    this.enabledOutputDevices.set(device.id, device)
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
  if (!window.navigator.requestMIDIAccess) {
    return new Map()
  }

  try {
    const midiAccess = await window.navigator.requestMIDIAccess()
    return midiAccess.inputs as unknown as MIDIInputMap
  } catch (error) {
    console.error(`Error accessing MIDI devices: ${error}`)
    return new Map()
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





const keyToNote: { [key: string]: number } = {}

export function getNote(key: string): number {
  if (Object.keys(keyToNote).length === 0) {
      const A0 = 21 // first note
      const C8 = 108 // last note
      const number2Key = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      for (let n = A0; n <= C8; n++) {
        const octave = ((n - 12) / 12) >> 0
        const name = number2Key[n % 12] + octave
        keyToNote[name] = n
      }
  }
  return keyToNote[key]
}
