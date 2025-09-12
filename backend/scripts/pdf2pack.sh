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

pdftoppm -rx 75 -ry 75 -gray -png "$PDF" "$FROOT"

sleep 1

FILES=$(ls -p "$FROOT"*.png)

XMLFILES=""
for FILE in $FILES; do
  echo "starting homr $FILE"
  cd /home/appuser/homr && poetry -v run homr "$FILE" || exit 1
  XML_FILE="${FILE%.png}.musicxml"
  if [ -z "$XMLFILES" ]; then
    XMLFILES="$XML_FILE"
  else
    XMLFILES="$XMLFILES $XML_FILE"
  fi
done
sleep 1

echo "Running relieur to merge musicxml files: $XMLFILES"
relieur $XMLFILES -o "$FROOT".musicxml

sleep 1

echo "Running pianoplayer for fingering detection"
pianoplayer "$FROOT".musicxml -o "$FROOT".musicxml -z

echo "TITLE: $TITLE"
echo "COMPOSER: $COMPOSER"

python /home/appuser/scripts/extract_fingering.py "$FROOT.musicxml"
python /home/appuser/scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER"

sleep 1

python /home/appuser/scripts/convert.py --verbose "$FROOT".musicxml "$FROOT".midi

musescore3 -f -o "$FROOT".pdf "$FROOT".musicxml

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml" "$FROOT.fingering.json"

#rm "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"
#rm "$FROOT.fingering.json"
