#!/bin/bash
# Convert a PDF to MXML using homr

echo "$#  Arguments passed: $@ "

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
#pdftoppm   -mono -png "$PDF" "$FROOT"
rm $FROOT*teaser*
ls -lah $FROOT*.png

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
