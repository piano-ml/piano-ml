#!/bin/bash
# Convert a PDF to MXML using homr

# Set QT platform to offscreen for headless execution in Docker
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99

# Alias python to python3 for compatibility
alias python=python3

cd homr

if [ $# -ne 5 ]; then
  echo "Usage: $0 <PDF>"
  #exit 1
fi



echo "processing $1"
PDF="$1"
TITLE="$2"
COMPOSER="$3"
FROOT="${PDF%.*}"
FROOT="${FROOT/upload_/}"

pdftoppm  -rx 75 -ry 75  -gray -png "$PDF" "$FROOT"
ls -lah "$FROOT*.png"

FILES=`ls -p $FROOT*.png`

XMLFILES=""
for FILE in $FILES; do
  echo "starting poetry run homr $FILE"
  poetry -v run homr "$FILE" || exit 1
  XML_FILE="${FILE%.png}.musicxml"
  XMLFILES="$XMLFILES $XML_FILE"
done
sleep 1
echo "All XML files: $XMLFILES --> $FROOT.musicxml"

python ../relieur/relieur/relieur.py $XMLFILES -o $FROOT.musicxml
echo "XXXXXXX Created $FROOT.musicxml"

sleep 1

pianoplayer $FROOT.musicxml -o $FROOT.musicxml -z

echo "TITLE: $TITLE"
echo "COMPOSER: $COMPOSER"

cd ..
python scripts/extract_fingering.py "$FROOT.musicxml"
python scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"

sleep 1

python scripts/convert.py --verbose $FROOT.musicxml $FROOT.midi

mscore -f -o $FROOT.pdf $FROOT.musicxml


zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json"

rm "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"
rm "$FROOT.fingering.json"
