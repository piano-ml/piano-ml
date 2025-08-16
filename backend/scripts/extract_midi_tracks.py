import sys
from music21 import converter, stream
import os

if len(sys.argv) != 4:
    print("Usage: python scripts/extract_midi_tracks.py <musicxml> <track1> <track2>")
    sys.exit(1)

musicxml_path = sys.argv[1]
track1 = int(sys.argv[2])
track2 = int(sys.argv[3])

score = converter.parse(musicxml_path)

# Sélectionne les deux parties demandées
parts = []
for idx, part in enumerate(score.parts):
    if idx == track1 or idx == track2:
        parts.append(part)

new_score = stream.Score()
for part in parts:
    new_score.append(part)

# Crée le nouveau nom de fichier
base, ext = os.path.splitext(musicxml_path)
new_path = f"{base}.musicxml"
new_score.write('musicxml', fp=new_path)
print(f"Fichier créé : {new_path}")

