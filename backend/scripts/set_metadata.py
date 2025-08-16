# scripts/set_metadata.py
import sys
from music21 import converter, metadata

if len(sys.argv) != 4:
    print("Usage: python -m music21 scripts/set_metadata.py <musicxml> <title> <composer>")
    sys.exit(1)

musicxml, title, composer = sys.argv[1], sys.argv[2], sys.argv[3]

score = converter.parse(musicxml)
score.metadata = metadata.Metadata()
score.metadata.title = title
score.metadata.composer = composer
score.write('musicxml', fp=musicxml)
