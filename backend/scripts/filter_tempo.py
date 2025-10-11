# scripts/filter_tempo.py
import sys
import json
from music21 import converter, metadata, note, tempo
from music21.musicxml.m21ToXml import typeToMusicXMLType

if len(sys.argv) != 2:
    print("Usage: python -m music21 scripts/filter_tempo.py <musicxml>")
    sys.exit(1)

musicxml = sys.argv[1]

score = converter.parse(musicxml)

# Extract tempos
tempos = []
for part in score.parts:
    for el in part.recurse():
        if isinstance(el, (tempo.TempoIndication, tempo.MetronomeMark)):
            if hasattr(el, 'number') and el.number:
                tempos.append(el.number)
            elif hasattr(el, 'getQuarterBPM'):
                tempos.append(el.getQuarterBPM())

# Calcul de la moyenne
if tempos:
    avg_tempo = sum(tempos) / len(tempos)
else:
    avg_tempo = 120

# Clean all existing tempos
for part in score.parts:
    to_remove = []
    for el in part.recurse():
        if isinstance(el, (tempo.TempoIndication, tempo.MetronomeMark)):
            to_remove.append(el)
    for el in to_remove:
        el.activeSite.remove(el)

# add tempo to the beginning of each part
for part in score.parts:
    mm = tempo.MetronomeMark(number=avg_tempo)
    part.insert(0, mm)

score.write('musicxml', fp=musicxml)
