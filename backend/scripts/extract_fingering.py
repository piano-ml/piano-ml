# scripts/extract_fingering.py
import sys
import json
from music21 import converter, note, articulations
import os

if len(sys.argv) != 2:
    print("Usage: python -m music21 scripts/extract_fingering.py <musicxml>")
    sys.exit(1)

musicxml = sys.argv[1]
score = converter.parse(musicxml)

result = []

for part in score.parts:
    part_data = []
    for n in part.recurse().notes:
        fingering = None
        for articulation in n.articulations:
            if isinstance(articulation, articulations.Fingering):
                fingering = articulation.fingerNumber
        part_data.append({'fingering': fingering})
    result.append(part_data)

# Remplace l'extension par .json
json_path = os.path.splitext(musicxml)[0] + '.fingering.json'
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
