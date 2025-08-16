#!/bin/bash
# Convert a Midi file to a suitable zipfile for pianoml

if [ $# -ne 1 ]; then
  echo "Usage: $0 <MIDI> <TRACK_RIGHT> <TRACK_LEFT>"
  exit 1
fi
FROOT=$1
TRACK_LEFT=$2
TRACK_LEFT=$3
FROOT="${FROOT%.*}"
FROOT="${FROOT/upload_/}"

python scripts/extract_midi_tracks "$1" "$TRACK_LEFT" "$TRACK_RIGHT"

mscore -o $FROOT.pdf $FROOT.musicxml
mv $1 "$FROOT.midi"

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"

rm "$FROOT.pdf" "$FROOT.mid" "$FROOT.musicxml"
