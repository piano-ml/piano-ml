#!/bin/bash
# Convert a Midi file to a suitable zipfile for pianoml
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

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

