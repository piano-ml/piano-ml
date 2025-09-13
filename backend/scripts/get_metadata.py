# scripts/set_metadata.py
import sys
import json
from music21 import converter, metadata

midifile = sys.argv[1]
score = converter.parse(midifile)


duration_seconds = score.duration.quarterLength * score.metronomeMarkBoundaries()[0][2].secondsPerQuarter()
measures_count = len(list(score.parts[0].getElementsByClass('Measure')))
has_lyrics = any(n.lyric is not None for n in score.parts[0].recurse().notes)

metadata_dict = {
    "tracks_count": len(score.parts),
    "duration_seconds": duration_seconds,
    "measures_count": measures_count,
    "has_lyrics": has_lyrics
}
print(metadata_dict)
with open("metadata.json", "w") as f:
    json.dump(metadata_dict, f, indent=2)
