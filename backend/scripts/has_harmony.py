#!/usr/bin/env python3
"""
Check if a MusicXML file contains harmony information.

Usage:
    python has_harmony.py <musicxml_file>

Output:
    1 if the file contains at least one <harmony> tag (ChordSymbol), 0 otherwise.
"""

import sys

from music21 import converter, harmony


def has_harmony(musicxml_path: str) -> bool:
    """Return True if the MusicXML file contains at least one harmony element."""
    score = converter.parse(musicxml_path)
    for element in score.recurse():
        if isinstance(element, harmony.ChordSymbol):
            return True
    return False


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <musicxml_file>", file=sys.stderr)
        sys.exit(2)

    musicxml_path = sys.argv[1]

    try:
        result = has_harmony(musicxml_path)
    except Exception as e:
        print(f"Error parsing MusicXML file: {e}", file=sys.stderr)
        sys.exit(1)

    print(1 if result else 0)


if __name__ == "__main__":
    main()

