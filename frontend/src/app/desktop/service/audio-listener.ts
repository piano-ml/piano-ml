/** The AudioParams of an AudioListener (3D panning), with their default values. */
const LISTENER_PARAMS: [name: string, value: number][] = [
  ['positionX', 0], ['positionY', 0], ['positionZ', 0],
  ['forwardX', 0], ['forwardY', 0], ['forwardZ', -1],
  ['upX', 0], ['upY', 1], ['upZ', 0],
];

/**
 * Firefox's AudioListener has no positionX... AudioParams, and Tone, given a native context, builds its listener
 * on them: "param must be an AudioParam" at startup. The missing ones are given real AudioParams (those of silent
 * nodes, never connected), with their default values; the app does no 3D panning.
 */
export function withListenerParams<T extends BaseAudioContext>(context: T): T {
  const listener = context.listener as unknown as Record<string, unknown>;
  for (const [name, value] of LISTENER_PARAMS) {
    if (listener[name] instanceof AudioParam) continue;
    const param = context.createConstantSource().offset;
    param.value = value;
    Object.defineProperty(listener, name, { value: param, configurable: true });
  }
  return context;
}
