#!/usr/bin/env python3
# scripts/has_fingering.py
# Retourne/print `1` si la partition contient au moins une annotation de fingering,
# `0` sinon. Quitte avec le même code de sortie (1 = présent, 0 = absent).

import sys
import os
from music21 import converter, articulations


def has_fingering(score):
    """Retourne True si le score music21 contient au moins une Fingering."""
    # Parcours robuste des parties et des notes
    parts = getattr(score, 'parts', []) or []
    for part in parts:
        for n in part.recurse().notes:
            for articulation in getattr(n, 'articulations', []) or []:
                if isinstance(articulation, articulations.Fingering):
                    return True
    return False


def main():
    if len(sys.argv) != 2:
        print("Usage: has_fingering.py <musicxml|mxl|xml>")
        sys.exit(2)

    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(2)

    try:
        score = converter.parse(path)
    except Exception as e:
        print(f"Error parsing file: {e}", file=sys.stderr)
        sys.exit(2)

    present = has_fingering(score)
    out = "1" if present else "0"
    print(out)
    # On renvoie aussi le code de sortie demandé (1 = présence, 0 = absence)
    #sys.exit(1 if present else 0)


if __name__ == '__main__':
    main()

