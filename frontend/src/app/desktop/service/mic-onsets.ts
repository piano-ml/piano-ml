/**
 * The microphone side of the loopback calibration: the microphone is recorded while the clicks play, then each
 * click is looked for in the recording, in the window where its sound can arrive. Knowing when each click was
 * played makes the search independent of the microphone's level: a click is its window's peak, and starts where,
 * walking back from it, the sound falls back to the room's level.
 */

/** A recording on the audio context's clock. */
export interface Recording {
  samples: Float32Array;
  sampleRate: number;
  /** Context time of the first sample. */
  startTime: number;
}

/** What the recording says about one click. */
export interface ClickOnset {
  /** Index of the click. */
  click: number;
  /** Context time its sound starts in the recording, or null when it was not heard. */
  time: number | null;
  /** Its peak above the window's background, in dB. */
  levelDb: number;
}

/** A click's sound is looked for from its scheduled time up to this much later (output + input latency). */
export const CLICK_SEARCH_S = 0.6;
/** A click is heard when its peak amplitude is this many times the window's median amplitude (4: 12 dB). */
const HEARD_RATIO = 4;
/** It starts at the earliest sample, walking back from its peak, above this fraction of the peak... */
const ONSET_FRACTION = 0.2;
/** ...or above this many times the median amplitude when that is higher (noise rarely reaches it)... */
const ONSET_NOISE_RATIO = 5;
/** ...with no gap longer than this between two such samples (a click's own zero crossings are shorter). */
const ONSET_GAP_S = 0.001;

const PROCESSOR = 'piano-ml-recorder';
/** The worklet sends the samples by chunks of this many seconds. */
const CHUNK_S = 0.1;

/** The AudioWorklet processor: posts the input samples, each chunk with the context time of its first sample. */
const WORKLET_SOURCE = `
class Recorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(Math.round(${CHUNK_S} * sampleRate));
    this.length = 0;
    this.chunkTime = 0;
    // stop(): the last partial chunk, then an answer saying everything was sent
    this.port.onmessage = () => {
      this.flush();
      this.port.postMessage({ done: true });
    };
  }
  flush() {
    if (this.length > 0) this.port.postMessage({ time: this.chunkTime, samples: this.chunk.slice(0, this.length) });
    this.length = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        if (this.length === 0) this.chunkTime = currentTime + i / sampleRate;
        this.chunk[this.length++] = channel[i];
        if (this.length === this.chunk.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR}', Recorder);
`;

const loadedContexts = new WeakSet<BaseAudioContext>();

/** Records `stream` in `context` until stop(), which resolves with the recording. */
export async function recordStream(context: AudioContext, stream: MediaStream): Promise<{ stop: () => Promise<Recording> }> {
  const source = context.createMediaStreamSource(stream);
  const recorder = await recordNode(context, source);
  return {
    stop: async () => {
      const recording = await recorder.stop();
      source.disconnect();
      return recording;
    },
  };
}

/** Records any source node (a microphone, or a buffer in tests) until stop(). */
export async function recordNode(context: BaseAudioContext, source: AudioNode): Promise<{ stop: () => Promise<Recording> }> {
  if (!loadedContexts.has(context)) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
      loadedContexts.add(context);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const node = new AudioWorkletNode(context, PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
  // Silent, but in the graph: the processor runs only when its output is pulled
  const mute = context.createGain();
  mute.gain.value = 0;
  const chunks: { time: number; samples: Float32Array }[] = [];
  let flushed: (() => void) | undefined;
  node.port.onmessage = (event: MessageEvent<{ time: number; samples: Float32Array } | { done: true }>) => {
    if ('done' in event.data) {
      flushed?.();
    } else {
      chunks.push(event.data);
    }
  };
  source.connect(node).connect(mute).connect(context.destination);
  return {
    stop: async () => {
      // Every chunk still on its way, then the last partial one: the port's messages arrive in order, the answer last
      await new Promise<void>((resolve) => {
        flushed = resolve;
        node.port.postMessage('flush');
        setTimeout(resolve, 1000); // a worklet that no longer answers
      });
      node.port.onmessage = null;
      source.disconnect(node);
      node.disconnect();
      mute.disconnect();
      return joinChunks(chunks, context.sampleRate);
    },
  };
}

/** The chunks as one recording; a gap (a dropped chunk) is left silent, so that the timing stays right. */
export function joinChunks(chunks: { time: number; samples: Float32Array }[], sampleRate: number): Recording {
  if (chunks.length === 0) return { samples: new Float32Array(0), sampleRate, startTime: 0 };
  const startTime = chunks[0].time;
  const last = chunks[chunks.length - 1];
  const length = Math.round((last.time - startTime) * sampleRate) + last.samples.length;
  const samples = new Float32Array(length);
  for (const chunk of chunks) {
    samples.set(chunk.samples, Math.round((chunk.time - startTime) * sampleRate));
  }
  return { samples, sampleRate, startTime };
}

/**
 * Looks for each click (scheduled at context times `clicks`) in `recording`, in the window from its time to
 * CLICK_SEARCH_S later: the peak, heard when well above the median, and its start walking back from it.
 */
export function findClickOnsets(recording: Recording, clicks: number[]): ClickOnset[] {
  const { samples, sampleRate, startTime } = recording;
  const indexOf = (time: number) => Math.round((time - startTime) * sampleRate);
  const gap = Math.max(1, Math.round(ONSET_GAP_S * sampleRate));
  return clicks.map((clickTime, click) => {
    const from = Math.max(0, indexOf(clickTime));
    const to = Math.min(samples.length, indexOf(clickTime + CLICK_SEARCH_S));
    if (to - from < sampleRate * 0.05) return { click, time: null, levelDb: 0 };
    const window = samples.subarray(from, to);
    const mean = window.reduce((sum, x) => sum + x, 0) / window.length; // a DC offset
    const amplitude = Float32Array.from(window, (x) => Math.abs(x - mean));
    let peakAt = 0;
    for (let i = 1; i < amplitude.length; i++) if (amplitude[i] > amplitude[peakAt]) peakAt = i;
    const peak = amplitude[peakAt];
    const median = Math.max(Float32Array.from(amplitude).sort()[amplitude.length >> 1], 1e-6);
    const levelDb = Math.round(20 * Math.log10(peak / median));
    if (peak < median * HEARD_RATIO) return { click, time: null, levelDb };
    const threshold = Math.min(peak / 2, Math.max(peak * ONSET_FRACTION, median * ONSET_NOISE_RATIO));
    let onset = peakAt;
    for (let i = peakAt - 1; i >= 0 && onset - i <= gap; i--) {
      if (amplitude[i] >= threshold) onset = i;
    }
    return { click, time: startTime + (from + onset) / sampleRate, levelDb };
  });
}

/** Seconds between a sound reaching the microphone and the context capturing it, as the browser reports it. */
export function inputLatency(stream: MediaStream): number {
  const settings = stream.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined;
  const latency = settings?.latency;
  return typeof latency === 'number' && Number.isFinite(latency) && latency > 0 ? latency : 0;
}
