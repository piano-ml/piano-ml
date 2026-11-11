#!/bin/sh

CUR_DIR=$(dirname "$(realpath "$0")")

cp "$CUR_DIR"/samples/src_test.midi "$CUR_DIR"/samples/test.mid
# tracks as numbered by the import page (@tonejs/midi): 22 and 23 are the two piano tracks of src_test.midi
./scripts/midi2pack.sh  "$CUR_DIR"/samples/test.mid "test title" "test composer" 0 22 23 || exit 1
 rm -f "$CUR_DIR"/samples/test.zip
 #
 cp "$CUR_DIR"/samples/src_test1.midi "$CUR_DIR"/samples/test.mid
 ./scripts/midi2pack.sh  "$CUR_DIR"/samples/test.mid "test title" "test composer" 1 2 3 || exit 1
 rm -f "$CUR_DIR"/samples/test.zip

 cp "$CUR_DIR"/samples/src_test.musicxml "$CUR_DIR"/samples/test.musicxml
 ./scripts/musicxml2pack.sh  "$CUR_DIR"/samples/test.musicxml "test title" "test composer" 1 || exit 1
 rm -f "$CUR_DIR"/samples/test.zip

 cp "$CUR_DIR"/samples/src_test.png "$CUR_DIR"/samples/test.png
 ./scripts/image2pack.sh  "$CUR_DIR"/samples/test.png "test title" "test composer" 1 || exit 1
 rm -f "$CUR_DIR"/samples/test.zip

 cp "$CUR_DIR"/samples/src_test.pdf "$CUR_DIR"/samples/test.pdf
 ./scripts/pdf2pack.sh  "$CUR_DIR"/samples/test.pdf "test title" "test composer" 1 || exit 1
 rm -f "$CUR_DIR"/samples/test.zip
