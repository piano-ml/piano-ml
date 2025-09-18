# scripts/set_metadata.py
import sys
import json
from music21 import converter, metadata, note
from music21.musicxml.m21ToXml import typeToMusicXMLType

if len(sys.argv) != 4:
    print("Usage: python -m music21 scripts/set_metadata.py <musicxml> <title> <composer>")
    sys.exit(1)

musicxml, title, composer = sys.argv[1], sys.argv[2], sys.argv[3]

score = converter.parse(musicxml)
score.metadata = metadata.Metadata()
score.metadata.title = title
score.metadata.composer = composer

for part in score.parts:
    for meas in part.getElementsByClass('Measure'):
        notes_to_remove = []
        for n in meas.notes:
            d = n.duration
            if True:
              print(typeToMusicXMLType(d.type))
              print(str(meas.number) + " " + str(d.quarterLength) + " sss " + str(d.type))
              #notes_to_remove.append(n)
        for n in notes_to_remove:
            meas.remove(n)


#score.write('musicxml', fp=musicxml)

duration_seconds = score.duration.quarterLength * score.metronomeMarkBoundaries()[0][2].secondsPerQuarter()
mesure_count = len(list(score.parts[0].getElementsByClass('Measure')))
has_lyrics = any(n.lyric is not None for n in score.parts[0].recurse().notes)

metadata_dict = {
    "duration_seconds": duration_seconds,
    "mesure_count": mesure_count,
    "has_lyrics": has_lyrics
}




with open("metadata.json", "w") as f:
    json.dump(metadata_dict, f, indent=2)
