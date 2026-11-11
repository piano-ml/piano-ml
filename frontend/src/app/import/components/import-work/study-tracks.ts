import type { Track } from '@tonejs/midi';

/**
 * Choosing the study tracks (the hands to practise) of an imported MIDI file. Indexes are positions in the
 * `tracks` array given; tracks without notes are never chosen (an empty track still reports program 0,
 * "acoustic grand piano", because it has no program change).
 */

/** Average pitch of a track's notes (0 without notes). */
export function averagePitch(track: Track): number {
  return track.notes.length ? track.notes.reduce((sum, note) => sum + note.midi, 0) / track.notes.length : 0;
}

/** A piano track with notes: General MIDI programs 0-7 ("piano" family), not on the drum channel. */
export function isPianoTrack(track: Track): boolean {
  return track.notes.length > 0 && !track.instrument.percussion && track.instrument.family === 'piano';
}

/** The study tracks as the hands: the higher-pitched track first (right hand), then the lower (left hand). */
export function inHandOrder(tracks: Track[], indexes: number[]): number[] {
  return [...indexes].sort((a, b) => averagePitch(tracks[b]) - averagePitch(tracks[a]));
}

/**
 * Default study tracks: the piano, i.e. its tracks with notes (the two with the most notes when there are
 * more); without a piano track, the first two tracks with notes that are not drums. In hand order.
 */
export function defaultStudyTracks(tracks: Track[]): number[] {
  const indexes = tracks.map((_, i) => i);
  const piano = indexes.filter((i) => isPianoTrack(tracks[i]));
  const chosen = piano.length > 0
    ? [...piano].sort((a, b) => tracks[b].notes.length - tracks[a].notes.length).slice(0, 2)
    : indexes.filter((i) => tracks[i].notes.length > 0 && !tracks[i].instrument.percussion).slice(0, 2);
  return inHandOrder(tracks, chosen);
}
