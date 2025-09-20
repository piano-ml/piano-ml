#!/bin/bash
# Convert a Midi file to a suitable zipfile for pianoml

if [ $# -le 3 ]; then
  echo "Usage: $0 <PDFFILE> <TITLE> <COMPOSER>"
  exit 1
fi
FROOT=$1
TITLE="$2"
COMPOSER="$3"
FROOT="${FROOT%.*}"
ORI=$FROOT
FROOT="${FROOT/upload_/}"

mv $ORI.musicxml $FROOT.musicxml

$HOME/shared-venv/bin/python ./scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"
$HOME/shared-venv/bin/python ./scripts/extract_fingering.py "$FROOT.musicxml"

musescore3 -o $FROOT.pdf $FROOT.musicxml

musescore3 -o $FROOT.mid $FROOT.musicxml

mv $FROOT.mid $FROOT.midi

$HOME/shared-venv/bin/python ./scripts/get_metadata.py "$FROOT.musicxml"

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json" "metadata.json"

