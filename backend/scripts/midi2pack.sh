#!/bin/bash
# Bash
set -euo pipefail
IFS=$'\n\t'

export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

# Script: `scripts/midi2pack.sh`
usage() {
  printf "Usage: %s <INPUT_FILE> <TITLE> <COMPOSER> <TRACK_RIGHT> <TRACK_LEFT>\n" "$0" >&2
  exit 2
}

if [ "$#" -lt 5 ]; then
  usage
fi

INPUT="$1"
TITLE="$2"
COMPOSER="$3"
TRACK_RIGHT="$4"
TRACK_LEFT="$5"

# Binaries
MUSESCORE_BIN="musescore3"
PY_BIN="${HOME}/shared-venv/bin/python"
PIANOPLAYER_BIN="pianoplayer"
ZIP_BIN="zip"

for cmd in "$MUSESCORE_BIN" "$PY_BIN" "$PIANOPLAYER_BIN" "$ZIP_BIN"; do
  if ! command -v "${cmd%%/*}" >/dev/null 2>&1 && [ ! -x "$cmd" ]; then
    printf "Error: required command not found: %s\n" "$cmd" >&2
    exit 3
  fi
done

# Prepare file roots
FROOT="${INPUT%.*}"
# remove leading prefix upload_ if present
FROOT="${FROOT/upload_/}"

mv -- "${INPUT}" "${FROOT}.midi"

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
trap cleanup EXIT

printf "Converting MIDI <-> MusicXML using %s\n" "$MUSESCORE_BIN"

# Convert and normalize format (do each step and fail fast)
"$MUSESCORE_BIN" -o "${FROOT}.musicxml" "${FROOT}.midi"
"$MUSESCORE_BIN" -o "${FROOT}.mid" "${FROOT}.musicxml"
"$MUSESCORE_BIN" -o "${FROOT}.musicxml" "${FROOT}.mid"

# Restore canonical extension
mv -- "${FROOT}.mid" "${FROOT}.midi"

if [ -n "$TRACK_RIGHT" ]; then
  printf "Extracting left/right hand track %s %s for %s.midi\n" "$TRACK_RIGHT" "$TRACK_LEFT" "$FROOT"
  "$PY_BIN" ./scripts/extract_midi_tracks.py "${FROOT}.musicxml" "$TRACK_RIGHT" "$TRACK_LEFT"
else
  printf "No track specified in original midi file\n" >&2
  exit 5
fi

printf "Running Pianoplayer for fingering detection ...\n"
"$PIANOPLAYER_BIN" "${FROOT}.musicxml" -o "${FROOT}.musicxml" -z > /dev/null

printf "Setting metadata in files ...\n"
"$PY_BIN" ./scripts/set_metadata.py "${FROOT}.musicxml" "$TITLE" "$COMPOSER"

printf "Extracting fingering ...\n"
"$PY_BIN" ./scripts/extract_fingering.py "${FROOT}.musicxml"

cp -- "${FROOT}.musicxml" "${FROOT}_filtered.musicxml"

printf "Creating PDF ...\n"
#printf "Filtering tempo ...\n"
#"$PY_BIN" ./scripts/filter_tempo.py "${FROOT}_filtered.musicxml"
"$MUSESCORE_BIN" -o "${FROOT}.pdf" "${FROOT}.musicxml"
#"$MUSESCORE_BIN" -o "${FROOT}.pdf" "${FROOT}.midi"

printf "Exporting metadata ...\n"
"$PY_BIN" ./scripts/get_metadata.py "${FROOT}.musicxml"

# ensure files exist before zipping
for f in "${FROOT}.pdf" "${FROOT}.midi" "${FROOT}.musicxml" "${FROOT}.fingering.json" metadata.json; do
  if [ ! -f "$f" ]; then
    printf "Warning: expected file missing: %s\n" "$f" >&2
  fi
done

"$ZIP_BIN" -j "${FROOT}.zip" "${FROOT}.pdf" "${FROOT}.midi" "${FROOT}.musicxml" "${FROOT}.fingering.json" "metadata.json"

printf "Cleaning intermediate files...\n"
rm -f "${FROOT}.pdf" "${FROOT}.midi" "${FROOT}.musicxml" "${FROOT}.fingering.json" "metadata.json" "${FROOT}_filtered.musicxml"

printf "Done: %s.zip\n" "${FROOT}"
