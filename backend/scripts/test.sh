#!/bin/sh

CUR_DIR=$(dirname "$(realpath "$0")")

cp "$CUR_DIR"/samples/src_test.musicxml "$CUR_DIR"/samples/test.musicxml
./scripts/musicxml2pack.sh  "$CUR_DIR"/samples/test.musicxml "test title" "test composer" 1 || exit 1

cp "$CUR_DIR"/samples/src_test.midi "$CUR_DIR"/samples/test.midi
./scripts/midi2pack.sh  "$CUR_DIR"/samples/test.midi "test title" "test composer" 0 1 1 || exit 1

cp "$CUR_DIR"/samples/src_test.png "$CUR_DIR"/samples/test.png
./scripts/image2pack.sh  "$CUR_DIR"/samples/test.png "test title" "test composer" 1 || exit 1

cp "$CUR_DIR"/samples/src_test.pdf "$CUR_DIR"/samples/test.pdf
./scripts/pdf2pack.sh  "$CUR_DIR"/samples/test.pdf "test title" "test composer" 1 || exit 1
