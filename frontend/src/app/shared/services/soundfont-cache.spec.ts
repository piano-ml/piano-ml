import {
  SOUNDFONT_CACHE, SOUNDFONT_URL, SOUNDFONT_WORKLET_URL, loadSoundFontFile, prefetchSoundFont, resetSoundFontPrefetch,
} from './soundfont-cache';

/** A RIFF file of `payload` bytes, as its header declares it. */
function riff(payload = 8): ArrayBuffer {
  const buffer = new ArrayBuffer(payload + 8);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, payload, true);
  return buffer;
}

/** The soundfont kept in the Cache API between visits, and prefetched from the pages that open the workbench. */
describe('soundfont cache', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r)); };

  beforeEach(async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    resetSoundFontPrefetch();
    fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(riff()));
  });
  afterEach(() => fetchSpy.mockRestore());

  it('shares one download between concurrent loads (a prefetch, then the workbench), each with its own copy', async () => {
    const [a, b] = await Promise.all([loadSoundFontFile(), loadSoundFontFile()]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(a).not.toBe(b);
    expect([a.byteLength, b.byteLength]).toEqual([16, 16]);
  });

  it('replaces a truncated cached copy', async () => {
    await (await caches.open(SOUNDFONT_CACHE)).put(SOUNDFONT_URL, new Response(riff().slice(0, 10)));
    expect((await loadSoundFontFile()).byteLength).toBe(16);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('drops the caches of older soundfont versions', async () => {
    await caches.open('pianoml-soundfont-v0');
    await caches.open('something-else');
    await loadSoundFontFile();
    await flush();
    expect((await caches.keys()).sort()).toEqual([SOUNDFONT_CACHE, 'something-else'].sort());
  });

  it('prefetches the soundfont and its worklet once per page, and not again once cached', async () => {
    prefetchSoundFont();
    prefetchSoundFont(); // a second hover
    await flush();
    expect(fetchSpy.mock.calls.map((call: unknown[]) => String(call[0])).sort()).toEqual([SOUNDFONT_URL, SOUNDFONT_WORKLET_URL].sort());
    resetSoundFontPrefetch();
    fetchSpy.mockClear();
    prefetchSoundFont(); // another page, the file already cached
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a failed prefetch can be tried again', async () => {
    fetchSpy.mockRejectedValue(new Error('offline'));
    prefetchSoundFont();
    await flush();
    fetchSpy.mockReset();
    fetchSpy.mockImplementation(async () => new Response(riff())); // back online
    prefetchSoundFont();
    await flush();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
