#!/bin/bash
# Convert a Midi file to a suitable zipfile for pianoml
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

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

mv $1 $FROOT.midi

# sanitize file
musescore3 -o $FROOT.musicxml $FROOT.midi
musescore3 -o $FROOT.mid $FROOT.musicxml

mv $FROOT.mid $FROOT.midi

if [ -n "$TRACK_RIGHT" ]; then
  echo "Extracting left/right hand track $TRACK_RIGHT $TRACK_LEFT for $FROOT.midi"
  # also does .midi -> .musicxml !
  $HOME/shared-venv/bin/python ./scripts/extract_midi_tracks.py "$FROOT".midi "$TRACK_RIGHT" "$TRACK_LEFT"
else
  echo "No track specified in original midi file"
  exit 1
fi

echo "Running pianoplayer for fingering detection"
pianoplayer "$FROOT".musicxml -o "$FROOT".musicxml -z > /dev/null 2>&1

$HOME/shared-venv/bin/python ./scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"

$HOME/shared-venv/bin/python ./scripts/extract_fingering.py "$FROOT.musicxml"

cp "$FROOT.musicxml" ${FROOT}_filtered.musicxml
$HOME/shared-venv/bin/python ./scripts/filter_tempo.py ${FROOT}_filtered.musicxml

musescore3 -o "$FROOT.pdf" ${FROOT}_filtered.musicxml

$HOME/shared-venv/bin/python ./scripts/get_metadata.py "$FROOT.musicxml"

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json" "metadata.json"

rm "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json" "metadata.json" ${FROOT}_filtered.musicxml

echo "Done!"
