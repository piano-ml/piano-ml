export type MidiEvent = {
    type: 'on' | 'off'
    velocity: number
    note: number
    timeStamp: number
  }



  
  export const qwertyKeyConfig: { [key: string]: string } = {
    // White Notes
    f: 'C',
    g: 'D',
    h: 'E',
    j: 'F',
    k: 'G',
    l: 'A',
    ';': 'B',
    // Black notes
    t: 'Db',
    y: 'Eb',
    i: 'Gb',
    o: 'Ab',
    p: 'Bb',
  }
  
  export type MidiStateEvent = {
    note: number
    velocity?: number
    type: 'down' | 'up'
    time: number
  }