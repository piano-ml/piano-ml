#!/bin/bash
# Convert a Midi file to a suitable zipfile for pianoml

if [ $# -le 3 ]; then
  echo "Usage: $0 <PDFFILE> <TITLE> <COMPOSER> <TRACK_RIGHT> <TRACK_LEFT>"
  exit 1
fi
FROOT=$1
TITLE="$2"
COMPOSER="$3"
TRACK_RIGHT=$4
TRACK_LEFT=$5
FROOT="${FROOT%.*}"
ORI=$FROOT
FROOT="${FROOT/upload_/}"

if [ -n "$TRACK_RIGHT" ]; then
  echo "Extracting left/right hand track: $TRACK_RIGHT $TRACK_LEFT"
  python scripts/extract_midi_tracks.py "$1" "$TRACK_RIGHT" "$TRACK_LEFT"
else
  echo "No track specified in original midi file"
  exit 1
fi

ls $FROOT.*

echo "mv $ORI.musicxml $FROOT.musicxml"

mv $ORI.musicxml $FROOT.musicxml

python scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"

musescore3 -o $FROOT.pdf $FROOT.musicxml

mv $1 "$FROOT.midi"

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"

rm "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"
