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
        console.log(`${device.manufacturer} ${device.name}`);
        this.enableInputMidiDevice(device)
      }
    })
  }

  enableInputMidiDevice(device: MIDIInput) {
    device.open()
    device.addEventListener('midimessage', this.onMidiMessage)
    this.enabledInputDevices.set(device.id, device)
    console.log(`Enabled MIDI input device: ${device.manufacturer} ${device.name}`)

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
    alert(`Your browser is not allowing MIDI. Please check your browser settings.`);
    return new Map()
  }
  try {
    const midiAccess = await navigator.requestMIDIAccess()
    return midiAccess.inputs as unknown as MIDIInputMap
  } catch (error) {
    alert(`Error accessing MIDI devices: ${error}`)
    return new Map()
  }
}
