#!/bin/bash
# Convert a IMAGE to MXML using homr

# Set QT platform to offscreen for headless Musescore3 execution in Docker
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

if [ $# -ne 5 ]; then
  echo "Usage: $0 <IMAGE> <TITLE> <COMPOSER>"
  #exit 1
fi

IMAGE="$1"
TITLE="$2"
COMPOSER="$3"
FROOT="${IMAGE%.*}"
FROOT="${FROOT/upload_/}"

mv $IMAGE "$FROOT.png"

cd homr
poetry run homr "$FROOT.png"
cd ..

# sanitize files
musescore3 -f -o "$FROOT".mscz "$FROOT".musicxml
musescore3 -f -o "$FROOT".mid "$FROOT".mscz
musescore3 -f -o "$FROOT".musicxml "$FROOT".mscz

mv "$FROOT".mid "$FROOT".midi

echo "Running pianoplayer for fingering detection"
pianoplayer "$FROOT".musicxml -o "$FROOT".musicxml -z

echo "TITLE: $TITLE"
echo "COMPOSER: $COMPOSER"

$HOME/shared-venv/bin/python ./scripts/extract_fingering.py "$FROOT.musicxml"
$HOME/shared-venv/bin/python ./scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"

musescore3 -f -o "$FROOT".pdf "$FROOT".musicxml

$HOME/shared-venv/bin/python ./scripts/get_metadata.py "$FROOT.musicxml"

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json" "metadata.json"

rm "$FROOT.png" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json" "metadata.json"
