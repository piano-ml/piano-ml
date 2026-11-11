"""Builds the MIDI files used by test_midi.sh, each track recognizable by its name and pitch range.

Usage: python make_test_midis.py <output_dir>

  one_track.mid            format 0, a single piano track (right hand C5..G5)
  two_tracks.mid           format 1, conductor track + RH (C5..G5) + LH (C3..G3)
  two_tracks_no_tempo.mid  format 1 without conductor track: RH + LH only
  four_tracks.mid          format 1, conductor + RH + LH + Strings (G4..D5, program 48) + Drums (channel 10)
  piano_one_track_two_hands.mid  format 1, conductor + one piano track holding both hands (C5.. and C3..)
  with_empty_track.mid     format 1, conductor + an empty "Intro" track + RH + LH: the frontend numbers them
                           0 Intro, 1 RH, 2 LH, while MuseScore drops the empty track
  format0_two_channels.mid format 0, one track with RH on channel 1 and LH on channel 2: the frontend splits
                           it into two tracks (0 RH, 1 LH)
  two_hands_same_channel.mid  format 1, conductor + RH + LH both on channel 1, program 0
"""
import os
import sys

import mido

TPB = 480
RH = [72, 74, 76, 77, 79, 77, 76, 74]  # C5..G5
LH = [48, 50, 52, 53, 55, 53, 52, 50]  # C3..G3
STRINGS = [67, 69, 71, 72, 74, 72, 71, 69]  # G4..D5
DRUMS = [36, 38, 36, 38, 36, 38, 36, 38]


def notes_track(name, pitches, channel=0, program=0, extra=None):
    track = mido.MidiTrack()
    track.append(mido.MetaMessage("track_name", name=name, time=0))
    if channel != 9:
        track.append(mido.Message("program_change", program=program, channel=channel, time=0))
    events = []
    for i, p in enumerate(pitches * 2):  # 4 bars of quarter notes
        events.append((i * TPB, mido.Message("note_on", note=p, velocity=80, channel=channel)))
        events.append(((i + 1) * TPB - 10, mido.Message("note_off", note=p, velocity=0, channel=channel)))
    for i, p in enumerate((extra or []) * 2):
        events.append((i * TPB, mido.Message("note_on", note=p, velocity=70, channel=channel)))
        events.append(((i + 1) * TPB - 10, mido.Message("note_off", note=p, velocity=0, channel=channel)))
    events.sort(key=lambda e: (e[0], e[1].type == "note_on"))
    now = 0
    for t, msg in events:
        track.append(msg.copy(time=t - now))
        now = t
    track.append(mido.MetaMessage("end_of_track", time=0))
    return track


def conductor():
    track = mido.MidiTrack()
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(96), time=0))
    track.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    track.append(mido.MetaMessage("key_signature", key="C", time=0))
    track.append(mido.MetaMessage("end_of_track", time=0))
    return track


def merge(name, *tracks):
    """One track holding the events of several (absolute times recomputed)."""
    events = []
    for track in tracks:
        now = 0
        for msg in track:
            now += msg.time
            if msg.type not in ("end_of_track", "track_name"):
                events.append((now, msg))
    events.sort(key=lambda e: e[0])
    merged = mido.MidiTrack([mido.MetaMessage("track_name", name=name, time=0)])
    now = 0
    for t, msg in events:
        merged.append(msg.copy(time=t - now))
        now = t
    merged.append(mido.MetaMessage("end_of_track", time=0))
    return merged


def save(path, midi_type, tracks):
    midi = mido.MidiFile(type=midi_type, ticks_per_beat=TPB)
    midi.tracks.extend(tracks)
    midi.save(path)


def main(out):
    os.makedirs(out, exist_ok=True)
    single = notes_track("RH", RH)
    single.insert(0, mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(96), time=0))
    save(os.path.join(out, "one_track.mid"), 0, [single])
    save(os.path.join(out, "two_tracks.mid"), 1, [conductor(), notes_track("RH", RH), notes_track("LH", LH, channel=1)])
    rh = notes_track("RH", RH)
    rh.insert(1, mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(96), time=0))
    save(os.path.join(out, "two_tracks_no_tempo.mid"), 1, [rh, notes_track("LH", LH, channel=1)])
    save(os.path.join(out, "four_tracks.mid"), 1, [
        conductor(), notes_track("RH", RH), notes_track("LH", LH, channel=1),
        notes_track("Strings", STRINGS, channel=2, program=48), notes_track("Drums", DRUMS, channel=9)])
    save(os.path.join(out, "piano_one_track_two_hands.mid"), 1, [conductor(), notes_track("Piano", RH, extra=LH)])
    intro = mido.MidiTrack([mido.MetaMessage("track_name", name="Intro", time=0), mido.MetaMessage("end_of_track", time=0)])
    save(os.path.join(out, "with_empty_track.mid"), 1, [conductor(), intro, notes_track("RH", RH), notes_track("LH", LH, channel=1)])
    save(os.path.join(out, "format0_two_channels.mid"), 0, [merge("Piano", conductor(), notes_track("RH", RH), notes_track("LH", LH, channel=1))])
    save(os.path.join(out, "two_hands_same_channel.mid"), 1, [conductor(), notes_track("RH", RH), notes_track("LH", LH)])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
