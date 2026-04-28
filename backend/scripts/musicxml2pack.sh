#!/bin/bash
# Convert a Midi file to a suitable zipfile for pianoml
source ~/shared-venv/bin/activate
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

if [ $# -le 2 ]; then
  echo "Usage: $0 <PDFFILE> <TITLE> <COMPOSER>"
  exit 1
fi
ORI=$1
TITLE="$2"
COMPOSER="$3"
MAKE_FINGERING="$4"
ROOT_DIR="$(dirname "$ORI")"
FROOT="${ORI%.*}"
FROOT="${FROOT/upload_/}"

# convert if needed mxl to musicxml
musescore3 -o $FROOT-ok.musicxml $ORI

# normalize by converting back and forth to .mid
musescore3 -o $FROOT-ok.mid $FROOT-ok.musicxml
musescore3 -o $FROOT-ok.musicxml $FROOT-ok.mid

mv $FROOT-ok.musicxml $FROOT.musicxml

HAS_FINGERING=$(python ./scripts/has_fingering.py "$FROOT.musicxml")
# Only run pianoplayer fingering detection when MAKE_FINGERING is set
# AND the score currently has no fingering (HAS_FINGERING == "0").
if [ -n "$MAKE_FINGERING" ] && [ "$HAS_FINGERING" = "0" ]; then
  case "$(echo "$MAKE_FINGERING" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y)
      echo "Running pianoplayer for fingering detection"
      pianoplayer "$FROOT".musicxml -o "$FROOT".musicxml -z > /dev/null 2>&1

      python ./scripts/extract_fingering.py "$FROOT.musicxml" > /dev/null 2>&1
      ;;
    *)
      echo "Skipping fingering detection (MAKE_FINGERING='$MAKE_FINGERING')"
      ;;
  esac
else
  echo "Skipping fingering detection (MAKE_FINGERING not set)"
fi


echo "Generating fingering"
python ./scripts/extract_fingering.py "$FROOT.musicxml" > /dev/null 2>&1

#HAS_HARMONY=$(python ./scripts/has_harmony.py "$FROOT.musicxml")
#if [ "$HAS_HARMONY" = "0" ]; then
#  echo "No harmony found, running auto_harmonize"
#  ./scripts/auto_harmonize.sh "$FROOT.musicxml" > /dev/null 2>&1
#else
#  echo "Harmony already present, skipping auto_harmonize"
#fi

echo "Cleaning input"
python ./scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER" > /dev/null 2>&1

echo "Extracting metadata"
python ./scripts/get_metadata.py "$FROOT.musicxml" > /dev/null 2>&1

echo "Generating MusicXML"
musescore3 -o $FROOT.pdf $FROOT.musicxml > /dev/null 2>&1

echo "Generating Midi"
#musescore3 -o $FROOT.mid $FROOT.musicxml > /dev/null 2>&1
cp $FROOT-ok.mid $FROOT.midi

echo "Building archive"
zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json" "metadata.json"

printf "Cleaning intermediate files...\n"
cd $ROOT_DIR
rm -f "${FROOT}.musicxml.bak" "${FROOT}.pdf" "${FROOT}-ok.midi" "${FROOT}.midi" "${FROOT}.musicxml" "${FROOT}.fingering.json" "metadata.json" "${FROOT}_filtered.musicxml"
