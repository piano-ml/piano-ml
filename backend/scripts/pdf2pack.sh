#!/bin/bash
# Convert a PDF to MXML using homr
# TODO: handle multiple page PDFs

cd homr

if [ $# -ne 3 ]; then
  echo "Usage: $0 <PDF>"
  exit 1
fi
echo "processing $1"
PDF="$1"
TITLE="$2"
COMPOSER="$3"
FROOT="${PDF%.*}"
FROOT="${FROOT/upload_/}"

pdftoppm -png "$PDF" "$FROOT"

FILES=`ls -p $FROOT*.png`

poetry run homr "$FILES"
rm  $FROOT*.png

mv $FROOT-1.musicxml $FROOT.musicxml
cd pianoplayer
pianoplayer $FROOT.musicxml -o $FROOT.musicxml -z
cd ..
python scripts/extract_fingering.py "$FROOT.musicxml"
python scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"
sleep 1
mscore -o $FROOT.pdf $FROOT.musicxml
mscore -o $FROOT.mid $FROOT.musicxml

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.mid" "$FROOT.musicxml" "$FROOT.fingering.json"

rm "$FROOT.pdf" "$FROOT.mid" "$FROOT.musicxml" "$FROOT.fingering.json"
