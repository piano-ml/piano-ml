#!/bin/bash
# Bash
set -euo pipefail
IFS=$'\n\t'

export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

source ~/shared-venv/bin/activate

# Script: `scripts/midi2pack.sh`
usage() {
  printf "Usage: %s <INPUT_FILE> <TITLE> <COMPOSER> <MAKE_FINGERING> <TRACK_RIGHT> [TRACK_LEFT]\n" "$0" >&2
  exit 2
}

if [ "$#" -lt 5 ]; then
  usage
fi

INPUT="$1"
TITLE="$2"
COMPOSER="$3"
MAKE_FINGERING="$4"
TRACK_RIGHT="$5"
TRACK_LEFT="${6:-}"

ls -lah "$INPUT"

# Prepare file roots
FROOT="${INPUT%.*}"
# remove leading prefix upload_ if present
FROOT="${FROOT/upload_/}"

#if [[ "${INPUT}" == *.mid ]]; then
  mv -- "${INPUT}" "${FROOT}.midi" || echo ""
#fi

# Ensure input exists
if [ ! -f "${FROOT}.midi" ]; then
  printf "Error: input file not found: %s\n" "${FROOT}.midi" >&2
  exit 4
fi

cleanup() {
  # keep only final zip; remove intermediates if present
  rm -f "${FROOT}.midi" "${FROOT}.musicxml" "${FROOT}.pdf" "${FROOT}.fingering.json" "metadata.json" "${FROOT}_filtered.musicxml"
  :
}
#trap cleanup EXIT

printf "Converting MIDI <-> MusicXML using %s\n" musescore3

# Convert and normalize format (do each step and fail fast)
musescore3 -o "${FROOT}.musicxml" "${FROOT}.midi" > /dev/null 2>&1
musescore3 -o "${FROOT}.mid" "${FROOT}.musicxml" > /dev/null 2>&1

# Restore canonical extension
mv -- "${FROOT}.mid" "${FROOT}.midi"

if [ -n "$TRACK_RIGHT" ]; then
  if [ -n "$TRACK_LEFT" ]; then
    printf "Extracting left/right hand track %s %s for %s.midi\n" "$TRACK_RIGHT" "$TRACK_LEFT" "$FROOT"
    python ./scripts/extract_midi_tracks.py "${FROOT}.musicxml" "$TRACK_RIGHT" "$TRACK_LEFT" 
  else
    printf "Extracting track %s for %s.midi (TRACK_LEFT omitted)\n" "$TRACK_RIGHT" "$FROOT"
    python ./scripts/extract_midi_tracks.py "${FROOT}.musicxml" "$TRACK_RIGHT"
    echo "spliting parts !"
    musescore3 -o "${FROOT}.mid" "${FROOT}.musicxml" > /dev/null 2>&1
    musescore3 -M ./scripts/midioperations.xml -o "${FROOT}.musicxml" "${FROOT}.mid"
    #mv -- "${FROOT}.mid" "${FROOT}.midi"

  fi
else
  printf "No track specified in original midi file\n" >&2
  exit 5
fi



if [ -n "$MAKE_FINGERING" ]; then
  case "$(echo "$MAKE_FINGERING" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y)
      echo "Running pianoplayer for fingering detection"
      pianoplayer "$FROOT".musicxml -o "$FROOT".musicxml -z > /dev/null

      ;;
    *)
      echo "Skipping fingering detection (MAKE_FINGERING='$MAKE_FINGERING')"
      ;;
  esac
else
  echo "Skipping fingering detection (MAKE_FINGERING not set)"
fi



printf "Extracting fingering ...\n"
python ./scripts/extract_fingering.py "${FROOT}.musicxml"

cp -- "${FROOT}.musicxml" "${FROOT}_filtered.musicxml"



#HAS_HARMONY=$(python ./scripts/has_harmony.py "$FROOT.musicxml")
#if [ "$HAS_HARMONY" = "0" ]; then
#  echo "No harmony found, running auto_harmonizer"
#  ./scripts/auto_harmonize.sh "$FROOT.musicxml" > /dev/null 2>&1 || exit 1
#else
#  echo "Harmony already present, skipping auto_harmonize"
#fi

printf "Setting metadata in files ...\n"
python ./scripts/set_metadata.py "${FROOT}.musicxml" "$TITLE" "$COMPOSER"

printf "Exporting metadata ...\n"
python ./scripts/get_metadata.py "${FROOT}.musicxml"

printf "Creating PDF ...\n"
musescore3 -o "${FROOT}.pdf" "${FROOT}.musicxml"

# ensure files exist before zipping
for f in "${FROOT}.pdf" "${FROOT}.midi" "${FROOT}.musicxml"  metadata.json; do
  if [ ! -f "$f" ]; then
    printf "Warning: expected file missing: %s\n" "$f" >&2
  fi
done

zip -j "${FROOT}.zip" "${FROOT}.pdf" "${FROOT}.midi" "${FROOT}.musicxml" "metadata.json"

printf "Cleaning intermediate files...\n"
rm -f "${FROOT}.musicxml.bak"  "${FROOT}.pdf" "${FROOT}.mid" "${FROOT}.midi" "${FROOT}.musicxml" "${FROOT}.fingering.json" "metadata.json" "${FROOT}_filtered.musicxml"

printf "Done: %s.zip\n" "${FROOT}"
