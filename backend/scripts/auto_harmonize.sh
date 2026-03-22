#!/bin/bash
# Add harmony information to a musicxml file using autoharmonizer2
set -euo pipefail

export PYTHONIOENCODING=utf-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOHARMONIZER_DIR="$SCRIPT_DIR/../autoharmonizer"

if [ $# -ne 1 ]; then
  echo "Usage: $0 <SOURCE>"
  exit 1
fi

SOURCE="$(realpath "$1")"
FILENAME="$(basename "$SOURCE")"
FROOT="${FILENAME%.*}"

if [ ! -f "$SOURCE" ]; then
  echo "Error: file not found: $SOURCE"
  exit 1
fi

cp "$SOURCE" "$AUTOHARMONIZER_DIR/inputs/"

cd $AUTOHARMONIZER_DIR
python  harmonizer.py || exit 1
cd ..

# instead of cp "$AUTOHARMONIZER_DIR/outputs/$FILENAME" "$SOURCE"
# but because autoharmonizer output .mxl, we need to convert it back to .musicxml
echo "$SOURCE <-- $AUTOHARMONIZER_DIR/outputs/$FILENAME"
musescore3 -o "$SOURCE" "$AUTOHARMONIZER_DIR/outputs/$FROOT.mxl"

echo "Harmonized: $SOURCE"
