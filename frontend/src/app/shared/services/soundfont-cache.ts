/**
 * The workbench's soundfont (about 10 MB): downloaded once, then kept in the Cache API, which unlike the HTTP cache
 * is not evicted for a big file nor subject to the server's cache headers. Pages that lead to the workbench
 * prefetch it when the user points at their Practice / Start button, so Play is ready sooner.
 */

export const SOUNDFONT_URL = '/assets/soundfonts/GeneralUserGS.sf3';
export const SOUNDFONT_WORKLET_URL = '/assets/soundfonts/spessasynth_processor.min.js';
/** Bump when the soundfont file changes: the older caches are deleted. */
export const SOUNDFONT_CACHE = 'pianoml-soundfont-v1';
const SOUNDFONT_CACHE_PREFIX = 'pianoml-soundfont-';

/**
 * True when the buffer holds a whole RIFF file (SF2/SF3): its header declares the payload size, so a
 * truncated download is shorter than that.
 */
export function isCompleteRiff(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) {
    return false;
  }
  const view = new DataView(buffer);
  const isRiff = view.getUint32(0, false) === 0x52494646; // "RIFF"
  return isRiff && buffer.byteLength >= view.getUint32(4, true) + 8;
}

/** The Cache API, or null where it is missing (insecure origin, old browser) or refused (private mode). */
async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(SOUNDFONT_CACHE);
  } catch {
    return null;
  }
}

/**
 * Downloads the soundfont and checks it is complete. The browser HTTP cache may hold a truncated copy
 * (a download cut mid-stream); in that case the file is fetched again once, bypassing the cache.
 */
async function download(signal?: AbortSignal): Promise<ArrayBuffer> {
  const get = async (cache: RequestCache): Promise<ArrayBuffer> => {
    const response = await fetch(SOUNDFONT_URL, { signal, cache });
    if (!response.ok) {
      throw new Error(`SoundFont download failed: HTTP ${response.status}`);
    }
    return response.arrayBuffer();
  };
  const buffer = await get('default');
  if (isCompleteRiff(buffer)) {
    return buffer;
  }
  console.warn(`SoundFont truncated (${buffer.byteLength} bytes), downloading it again`);
  const retry = await get('reload');
  if (!isCompleteRiff(retry)) {
    throw new Error(`SoundFont download incomplete: ${retry.byteLength} bytes`);
  }
  return retry;
}

/** The load in flight: a prefetch and the workbench opening right after it share one download. */
let inFlight: Promise<ArrayBuffer> | null = null;

/**
 * The soundfont, from the Cache API when it holds a complete copy, else downloaded and kept there. Concurrent calls
 * share one load; each gets its own copy (the synth may take ownership of its buffer).
 */
export async function loadSoundFontFile(signal?: AbortSignal): Promise<ArrayBuffer> {
  inFlight ??= loadOnce(signal).finally(() => { inFlight = null; });
  return (await inFlight).slice(0);
}

async function loadOnce(signal?: AbortSignal): Promise<ArrayBuffer> {
  const cache = await openCache();
  if (cache) {
    try {
      const cached = await cache.match(SOUNDFONT_URL);
      if (cached) {
        const buffer = await cached.arrayBuffer();
        if (isCompleteRiff(buffer)) {
          return buffer;
        }
        await cache.delete(SOUNDFONT_URL);
      }
    } catch {
      // unreadable copy: download it again
    }
  }
  const buffer = await download(signal);
  if (cache) {
    // Quota errors only cost the next visit
    cache.put(SOUNDFONT_URL, new Response(buffer.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }))
      .catch(() => undefined);
    void dropOlderCaches();
  }
  return buffer;
}

/** Deletes the caches of previous soundfont versions. */
async function dropOlderCaches(): Promise<void> {
  try {
    for (const name of await caches.keys()) {
      if (name.startsWith(SOUNDFONT_CACHE_PREFIX) && name !== SOUNDFONT_CACHE) {
        await caches.delete(name);
      }
    }
  } catch {
    // nothing to clean, or not allowed
  }
}

let prefetching: Promise<void> | null = null;

/**
 * Warms the soundfont (Cache API) and its worklet (HTTP cache) for a workbench about to open: once per page, not
 * on a data-saving connection. Safe to call from any hover or focus.
 */
export function prefetchSoundFont(): void {
  if (prefetching || typeof window === 'undefined') return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  prefetching = (async () => {
    const cache = await openCache();
    if (cache && await cache.match(SOUNDFONT_URL).catch(() => undefined)) return;
    await Promise.all([loadSoundFontFile(), fetch(SOUNDFONT_WORKLET_URL)]);
  })().catch(() => {
    prefetching = null; // a later hover may try again
  });
}

/** For specs: forgets that the prefetch ran. */
export function resetSoundFontPrefetch(): void {
  prefetching = null;
}
