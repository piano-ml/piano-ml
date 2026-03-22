#!/bin/bash
# Convert a IMAGE to MXML using homr

# Set QT platform to offscreen for headless Musescore3 execution in Docker
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

if [ $# -ne 4 ]; then
  echo "Usage: $0 <IMAGE> <TITLE> <COMPOSER> <MAKE_FINGERING>"
  #exit 1
fi

IMAGE="$1"
TITLE="$2"
COMPOSER="$3"
MAKE_FINGERING="$4"

FROOT="${IMAGE%.*}"
FROOT="${FROOT/upload_/}"

if [ "$IMAGE" != "$FROOT.png" ]; then
  mv "$IMAGE" "$FROOT.png"
fi

cd homr
echo "Running homr"
poetry run homr "$FROOT.png" > /dev/null  || exit 1
cd ..

source ~/shared-venv/bin/activate

HAS_HARMONY=$(python ./scripts/has_harmony.py "$FROOT.musicxml")
if [ "$HAS_HARMONY" = "0" ]; then
  echo "No harmony found, running auto_harmonizer"
  ./scripts/auto_harmonize.sh "$FROOT.musicxml" >  /dev/null  || exit 1
else
  echo "Harmony already present, skipping auto_harmonize"
fi

$HOME/shared-venv/bin/python ./scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER" > /dev/null  || exit 1

# sanitize files
musescore3 -f -o "$FROOT".mscz "$FROOT".musicxml > /dev/null  || exit 1
musescore3 -f -o "$FROOT".mid "$FROOT".mscz > /dev/null  || exit 1
musescore3 -f -o "$FROOT".musicxml "$FROOT".mscz > /dev/null  || exit 1

mv "$FROOT".mid "$FROOT".midi

if [ -n "$MAKE_FINGERING" ]; then
  case "$(echo "$MAKE_FINGERING" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y)
      echo "Running pianoplayer for fingering detection"
      pianoplayer "$FROOT".musicxml -o "$FROOT".musicxml -z > /dev/null  || exit 1

      $HOME/shared-venv/bin/python ./scripts/extract_fingering.py "$FROOT.musicxml"
      ;;
    *)
      echo "Skipping fingering detection (MAKE_FINGERING='$MAKE_FINGERING')"
      ;;
  esac
else
  echo "Skipping fingering detection (MAKE_FINGERING not set)"
fi


$HOME/shared-venv/bin/python ./scripts/extract_fingering.py "$FROOT.musicxml" > /dev/null  || exit 1


musescore3 -f -o "$FROOT".pdf "$FROOT".musicxml > /dev/null  || exit 1

$HOME/shared-venv/bin/python ./scripts/get_metadata.py "$FROOT.musicxml" > /dev/null  || exit 1

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"  "metadata.json"

rm "${FROOT}.png"  "${FROOT}_teaser.png" "$FROOT.pdf"  "$FROOT.mscz" "$FROOT.midi" "$FROOT.musicxml"  "$FROOT.musicxml.bak" "$FROOT.fingering.json" "metadata.json"
