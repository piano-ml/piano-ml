"""Writes a copy of a MIDI file holding only the chosen tracks, for the sheet music (musicxml / pdf).

Usage: python select_midi_tracks.py <input.midi> <output.midi> <track_right> [track_left]

Track numbers are the ones the frontend shows and stores in study_tracks, i.e. @tonejs/midi's `midi.tracks`:
  - each file track is split so that a track holds one (channel, program) pair: the first pair keeps the
    track's place, the others follow it (meta events stay with the first);
  - empty tracks are kept;
  - in a format 1 file, the first track is dropped when it has no notes (the conductor track).
The output is a format 1 file: a conductor track with the tempo / time / key signatures of every other
track, then the chosen tracks in file order. The input is never modified.
"""
import sys

import mido

GLOBAL_META = {"set_tempo", "time_signature", "key_signature"}


def split_tracks(midi):
    """Tracks as lists of (absolute tick, message), split like @tonejs/midi's splitTracks."""
    new_tracks = []
    for track in midi.tracks:
        default = len(new_tracks)
        track_map = {}
        program = [0] * 16
        now = 0
        for msg in track:
            now += msg.time
            target = default
            channel = getattr(msg, "channel", None)
            if channel is not None and not msg.is_meta:
                if msg.type == "program_change":
                    program[channel] = msg.program
                key = (program[channel], channel)
                if key not in track_map:
                    track_map[key] = default + len(track_map)
                target = track_map[key]
            while len(new_tracks) <= target:
                new_tracks.append([])
            new_tracks[target].append((now, msg))
    return new_tracks


def has_sounding_notes(events):
    """@tonejs/midi drops the first track when its duration (end of its last note) is 0."""
    started = {}
    for tick, msg in events:
        if msg.type == "note_on" and msg.velocity > 0:
            started[(msg.channel, msg.note)] = tick
        elif msg.type in ("note_off", "note_on") and (msg.channel, msg.note) in started:
            if tick > 0:
                return True
            del started[(msg.channel, msg.note)]
    return False


def frontend_tracks(midi):
    """The (index in split list) of each track as the frontend numbers them, plus the split list."""
    tracks = split_tracks(midi)
    indexes = list(range(len(tracks)))
    if midi.type == 1 and tracks and not has_sounding_notes(tracks[0]):
        indexes = indexes[1:]
    return tracks, indexes


def to_track(events):
    track = mido.MidiTrack()
    now = 0
    for tick, msg in sorted(events, key=lambda e: e[0]):  # stable: keeps the order of same-tick events
        if msg.type == "end_of_track":
            continue
        track.append(msg.copy(time=tick - now))
        now = tick
    track.append(mido.MetaMessage("end_of_track", time=0))
    return track


def main(argv):
    if len(argv) not in (4, 5):
        print(__doc__, file=sys.stderr)
        return 2
    source, target = argv[1], argv[2]
    try:
        wanted = [int(argv[3])] + ([int(argv[4])] if len(argv) == 5 and argv[4] != "" else [])
    except ValueError:
        print(f"Error: track numbers must be integers: {argv[3:]}", file=sys.stderr)
        return 1

    midi = mido.MidiFile(source)
    tracks, indexes = frontend_tracks(midi)
    print(f"{len(indexes)} track(s) as numbered by the frontend; chosen: {wanted}")
    for n in wanted:
        if n < 0 or n >= len(indexes):
            print(f"Error: track {n} out of range (0..{len(indexes) - 1})", file=sys.stderr)
            return 1
    chosen = sorted({indexes[n] for n in wanted})
    if not any(m.type == "note_on" and m.velocity > 0 for i in chosen for _, m in tracks[i]):
        # MuseScore cannot engrave a score without notes (it crashes making the PDF)
        print(f"Error: the chosen track(s) {wanted} have no notes", file=sys.stderr)
        return 1

    conductor = [(t, m) for i, events in enumerate(tracks) if i not in chosen for t, m in events
                 if m.is_meta and m.type in GLOBAL_META]
    out = mido.MidiFile(type=1, ticks_per_beat=midi.ticks_per_beat)
    out.tracks.append(to_track(conductor))
    for i in chosen:
        out.tracks.append(to_track(tracks[i]))
    out.save(target)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
