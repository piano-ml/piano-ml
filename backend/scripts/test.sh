#!/bin/sh

#./scripts/musicxml2pack.sh  ./src/test/resources/samples/test.musicxml "test title" "test composer" || exit 1
./scripts/midi2pack.sh  ../src/test/resources/samples/test.midi "test title" "test composer" || exit 1
#./scripts/pdf2pack.sh  ../src/test/resources/samples/test.pdf "test title" "test composer" || exit 1
#./scripts/image2pack.sh  ../src/test/resources/samples/test.png "test title" "test composer" || exit 1
