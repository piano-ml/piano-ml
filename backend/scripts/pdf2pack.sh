#!/bin/bash
# Convert a PDF to MXML using homr

# Set QT platform to offscreen for headless Musescore3 execution in Docker
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99

if [ $# -ne 5 ]; then
  echo "Usage: $0 <PDF> <TITLE> <COMPOSER>"
  #exit 1
fi

PDF="$1"
TITLE="$2"
COMPOSER="$3"
FROOT="${PDF%.*}"
FROOT="${FROOT/upload_/}"

pdftoppm -rx 300 -ry 300 -gray -png "$PDF" "$FROOT"

sleep 1

FILES=$(ls -p "$FROOT"*.png)
pwd
XMLFILES=""
for FILE in $FILES; do
  echo "starting homr $FILE"
  cd homr && poetry run homr "$FILE"
  XML_FILE="${FILE%.png}.musicxml"
  if [ -z "$XMLFILES" ]; then
    XMLFILES="$XML_FILE"
  else
    XMLFILES="$XMLFILES $XML_FILE"
  fi
done
sleep 1

cd ..
pwd
echo "Running relieur to merge musicxml files: $XMLFILES"

$HOME/shared-venv/bin/python ./relieur/relieur/relieur.py $XMLFILES -o "$FROOT".musicxml

musescore3 -f -o "$FROOT".mid "$FROOT".musicxml
mv "$FROOT".mid "$FROOT".midi
musescore3 -f -o "$FROOT".musicxml "$FROOT".midi

echo "Running pianoplayer for fingering detection"
pianoplayer "$FROOT".musicxml -o "$FROOT".musicxml -z

echo "TITLE: $TITLE"
echo "COMPOSER: $COMPOSER"

$HOME/shared-venv/bin/python ./scripts/extract_fingering.py "$FROOT.musicxml"
$HOME/shared-venv/bin/python ./scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"

musescore3 -f -o "$FROOT".pdf "$FROOT".musicxml

$HOME/shared-venv/bin/python ./scripts/get_metadata.py "$FROOT.musicxml"

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json" "metadata.json"

#rm "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"
#rm "$FROOT.fingering.json"
