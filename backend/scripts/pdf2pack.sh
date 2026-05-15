#!/bin/bash
# Convert a PDF to MXML using homr

# Set QT platform to offscreen for headless Musescore3 execution in Docker
export QT_QPA_PLATFORM=offscreen
export QT_QPA_PLATFORM_PLUGIN_PATH=/usr/lib/x86_64-linux-gnu/qt5/plugins
export DISPLAY=:99
export PYTHONIOENCODING=utf-8

if [ $# -ne 4 ]; then
  echo "Usage: $0 <PDF> <TITLE> <COMPOSER>"
  #exit 1
fi

PDF="$1"
TITLE="$2"
COMPOSER="$3"
MAKE_FINGERING="$4"
FROOT="${PDF%.*}"
FROOT="${FROOT/upload_/}"

echo "Converting PDF to PNG using pdftoppm"
pdftoppm  -rx 300 -ry 300 -png "$PDF" "$FROOT" || exit 1

sleep 1

FILES=$(ls -p "$FROOT"*.png)

XMLFILES=""
cd homr
for FILE in $FILES; do
  echo "starting homr $FILE"
   poetry run homr "$FILE" > /dev/null #|| exit 1
  XML_FILE="${FILE%.png}.musicxml"
  if [ -z "$XMLFILES" ]; then
    XMLFILES="$XML_FILE"
  else
    XMLFILES="$XMLFILES $XML_FILE"
  fi
done
sleep 1

cd ..

source ~/shared-venv/bin/activate

echo "Running relieur to merge musicxml files: $XMLFILES"
echo "python ./relieur/relieur/relieur.py -o "$FROOT".musicxml concat $XMLFILES "

~/shared-venv/bin/python ./relieur/relieur/relieur.py -o "$FROOT".musicxml concat $XMLFILES > /dev/null


#HAS_HARMONY=$(python ./scripts/has_harmony.py "$FROOT.musicxml")
#if [ "$HAS_HARMONY" = "0" ]; then
#  echo "No harmony found, running auto_harmonizer"
#  ./scripts/auto_harmonize.sh "$FROOT.musicxml"  > /dev/null 2>&1 || exit 1
#else
#  echo "Harmony already present, skipping auto_harmonize"
#fi

$HOME/shared-venv/bin/python ./scripts/set_metadata.py "$FROOT.musicxml" "$TITLE" "$COMPOSER" > /dev/null

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
      ;;
    *)
      echo "Skipping fingering detection (MAKE_FINGERING='$MAKE_FINGERING')"
      ;;
  esac
else
  echo "Skipping fingering detection (MAKE_FINGERING not set)"
fi


$HOME/shared-venv/bin/python ./scripts/extract_fingering.py "$FROOT.musicxml" || echo "set extract fingering failed !"


musescore3 -f -o "$FROOT".pdf "$FROOT".musicxml > /dev/null  || exit 1

$HOME/shared-venv/bin/python ./scripts/get_metadata.py "$FROOT.musicxml" > /dev/null  || exit 1

zip -j "$FROOT.zip" "$FROOT.pdf" "$FROOT.midi" "$FROOT.musicxml"  "metadata.json"

rm  "$FROOT"*.png $XMLFILES "$FROOT.pdf"  "$FROOT.mscz" "$FROOT.midi" "$FROOT.musicxml"  "$FROOT.musicxml.bak" "$FROOT.fingering.json" "metadata.json"
