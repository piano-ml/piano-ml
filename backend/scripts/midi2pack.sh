#!/bin/bash
# Bash
set -euo pipefail
IFS=$'\n\t'

export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

source ~/shared-venv/bin/activate

# helper scripts next to this one, whatever the current directory
SCRIPTS_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

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

# Prepare file roots: same folder, file name without its extension and without a leading "upload_"
# (PackService expects the zip there). Only the file name is changed: a folder named upload_... is left alone.
INPUT_DIR="$(cd "$(dirname -- "$INPUT")" && pwd)"
INPUT_NAME="$(basename -- "$INPUT")"
INPUT_NAME="${INPUT_NAME%.*}"
FROOT="${INPUT_DIR}/${INPUT_NAME#upload_}"

if [ "$INPUT_DIR/$(basename -- "$INPUT")" != "${FROOT}.midi" ]; then
  mv -- "${INPUT}" "${FROOT}.midi"
fi

# Ensure input exists
if [ ! -f "${FROOT}.midi" ]; then
  printf "Error: input file not found: %s\n" "${FROOT}.midi" >&2
  exit 4
fi

# metadata.json is written to the current directory by get_metadata.py: give each run its own, so concurrent
# imports cannot zip or delete each other's metadata.
WORK_DIR="$(mktemp -d)"

cleanup() {
  # keep only final zip; remove intermediates if present (also when a step fails)
  rm -f "${FROOT}.midi" "${FROOT}.musicxml" "${FROOT}.musicxml.bak" "${FROOT}.pdf" "${FROOT}.fingering.json" "${FROOT}_filtered.musicxml"
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# ${FROOT}.midi is the upload, byte for byte, and is never modified: it goes into the zip for the player,
# which plays every track and finds the study tracks in it by the numbers the import page showed.
# Only the sheet music (musicxml, pdf) is reduced to the chosen tracks, from a copy holding just those.
if [ -z "$TRACK_RIGHT" ]; then
  printf "No track specified in original midi file\n" >&2
  exit 5
fi

printf "Selecting track(s) %s %s of %s.midi for the score\n" "$TRACK_RIGHT" "$TRACK_LEFT" "$FROOT"
python "$SCRIPTS_DIR"/select_midi_tracks.py "${FROOT}.midi" "$WORK_DIR/score.mid" "$TRACK_RIGHT" ${TRACK_LEFT:+"$TRACK_LEFT"}

printf "Converting MIDI -> MusicXML using %s\n" musescore3
musescore3 -o "${FROOT}.musicxml" "$WORK_DIR/score.mid" > /dev/null 2>&1



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
python "$SCRIPTS_DIR"/extract_fingering.py "${FROOT}.musicxml"

cp -- "${FROOT}.musicxml" "${FROOT}_filtered.musicxml"



#HAS_HARMONY=$(python "$SCRIPTS_DIR"/has_harmony.py "$FROOT.musicxml")
#if [ "$HAS_HARMONY" = "0" ]; then
#  echo "No harmony found, running auto_harmonizer"
#  "$SCRIPTS_DIR"/auto_harmonize.sh "$FROOT.musicxml" > /dev/null 2>&1 || exit 1
#else
#  echo "Harmony already present, skipping auto_harmonize"
#fi

printf "Setting metadata in files ...\n"
python "$SCRIPTS_DIR"/set_metadata.py "${FROOT}.musicxml" "$TITLE" "$COMPOSER"

printf "Exporting metadata ...\n"
(cd "$WORK_DIR" && python "$SCRIPTS_DIR/get_metadata.py" "${FROOT}.musicxml")

printf "Creating PDF ...\n"
musescore3 -o "${FROOT}.pdf" "${FROOT}.musicxml"

# ensure files exist before zipping
for f in "${FROOT}.pdf" "${FROOT}.midi" "${FROOT}.musicxml" "$WORK_DIR/metadata.json"; do
  if [ ! -f "$f" ]; then
    printf "Warning: expected file missing: %s\n" "$f" >&2
  fi
done

zip -j "${FROOT}.zip" "${FROOT}.pdf" "${FROOT}.midi" "${FROOT}.musicxml" "$WORK_DIR/metadata.json"

printf "Cleaning intermediate files...\n"
cleanup

printf "Done: %s.zip\n" "${FROOT}"
